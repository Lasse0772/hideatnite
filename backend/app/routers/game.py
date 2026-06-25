from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.store import get_game, get_game_by_player
from app.models.game import PlayerRole, PlayerStatus, Location, haversine_distance_m
import random
import time
import math

router = APIRouter()

# pending catches: {(seeker_id, hider_id): timestamp}
pending_catches: dict[tuple, float] = {}


class StartGameRequest(BaseModel):
    player_id: str
    center: Location


class CatchRequest(BaseModel):
    seeker_id: str
    hider_id: str


class ConfirmCatchRequest(BaseModel):
    hider_id: str
    seeker_id: str
    confirm: bool  # True = yes caught, False = dispute


@router.post("/start")
def start_game(req: StartGameRequest):
    state = get_game_by_player(req.player_id)
    if not state:
        raise HTTPException(404, "Lobby nicht gefunden")
    if state.host_id != req.player_id:
        raise HTTPException(403, "Nur der Host kann das Spiel starten")
    if len(state.players) < 2:
        raise HTTPException(400, "Mindestens 2 Spieler benötigt")

    state.center = req.center
    state.current_radius_km = state.settings.start_radius_km
    state.phase = "playing"
    state.started_at = time.time()
    state.next_ping_at = time.time() + state.settings.ping_interval_seconds

    # Generate endpoint (random point within start zone)
    if state.settings.endpoint_random:
        angle = random.uniform(0, 2 * math.pi)
        dist_km = random.uniform(state.settings.end_radius_km, state.settings.start_radius_km * 0.6)
        dlat = (dist_km / 111.32)
        dlng = (dist_km / (111.32 * math.cos(math.radians(req.center.lat))))
        state.endpoint = Location(
            lat=req.center.lat + dlat * math.sin(angle),
            lng=req.center.lng + dlng * math.cos(angle),
        )
    else:
        state.endpoint = req.center  # fallback

    # Assign seekers
    players = list(state.players.values())
    random.shuffle(players)
    for i, p in enumerate(players):
        if i < state.settings.seeker_count:
            p.role = PlayerRole.SEEKER
        else:
            p.role = PlayerRole.HIDER
        p.status = PlayerStatus.ALIVE

    return {"ok": True, "endpoint": state.endpoint, "lobby_code": state.lobby_code}


@router.post("/catch")
def initiate_catch(req: CatchRequest):
    """Seeker initiates a catch — sends confirmation request to hider."""
    state = get_game_by_player(req.seeker_id)
    if not state:
        raise HTTPException(404, "Spiel nicht gefunden")

    seeker = state.players.get(req.seeker_id)
    hider = state.players.get(req.hider_id)
    if not seeker or not hider:
        raise HTTPException(404, "Spieler nicht gefunden")
    if seeker.role != PlayerRole.SEEKER:
        raise HTTPException(400, "Nur Seeker können fangen")
    if hider.status != PlayerStatus.ALIVE:
        raise HTTPException(400, "Spieler ist nicht mehr aktiv")

    # GPS plausibility check (must be within 50m)
    if seeker.location and hider.location:
        dist = haversine_distance_m(seeker.location, hider.location)
        if dist > 50:
            raise HTTPException(400, f"Zu weit entfernt ({dist:.0f}m) — näher heranfahren")

    pending_catches[(req.seeker_id, req.hider_id)] = time.time()
    return {"ok": True, "message": "Bestätigung an Hider gesendet"}


@router.post("/confirm-catch")
def confirm_catch(req: ConfirmCatchRequest):
    """Hider confirms or disputes the catch."""
    key = (req.seeker_id, req.hider_id)
    if key not in pending_catches:
        raise HTTPException(404, "Kein ausstehender Fang-Request")

    # Expire after 60s
    if time.time() - pending_catches[key] > 60:
        del pending_catches[key]
        raise HTTPException(400, "Bestätigung abgelaufen")

    del pending_catches[key]

    if not req.confirm:
        return {"ok": True, "result": "disputed"}

    state = get_game_by_player(req.hider_id)
    if not state:
        raise HTTPException(404, "Spiel nicht gefunden")

    hider = state.players.get(req.hider_id)
    if not hider:
        raise HTTPException(404, "Spieler nicht gefunden")

    if state.settings.game_mode == "infection":
        hider.role = PlayerRole.SEEKER
        hider.status = PlayerStatus.ALIVE
    else:
        hider.status = PlayerStatus.CAUGHT

    return {"ok": True, "result": "caught", "game_mode": state.settings.game_mode}


@router.get("/pending-catch/{player_id}")
def get_pending_catch(player_id: str):
    """Hider polls this to see if there's a pending catch request."""
    for (seeker_id, hider_id), ts in list(pending_catches.items()):
        if hider_id == player_id:
            state = get_game_by_player(seeker_id)
            seeker_name = "?"
            if state:
                s = state.players.get(seeker_id)
                if s:
                    seeker_name = s.nickname
            return {"pending": True, "seeker_id": seeker_id, "seeker_name": seeker_name}
    return {"pending": False}
