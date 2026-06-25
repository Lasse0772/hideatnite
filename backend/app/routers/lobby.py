from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.store import create_lobby, get_game, player_lobby
from app.models.game import Player, PlayerRole, LobbySettings
import uuid

router = APIRouter()


class CreateLobbyRequest(BaseModel):
    nickname: str


class JoinLobbyRequest(BaseModel):
    nickname: str
    lobby_code: str


class UpdateSettingsRequest(BaseModel):
    player_id: str
    settings: LobbySettings


@router.post("/create")
def create(req: CreateLobbyRequest):
    player_id = str(uuid.uuid4())
    state = create_lobby(player_id, req.nickname)
    return {"lobby_code": state.lobby_code, "player_id": player_id}


@router.post("/join")
def join(req: JoinLobbyRequest):
    state = get_game(req.lobby_code)
    if not state:
        raise HTTPException(404, "Lobby nicht gefunden")
    if state.phase != "lobby":
        raise HTTPException(400, "Spiel bereits gestartet")
    player_id = str(uuid.uuid4())
    player = Player(id=player_id, nickname=req.nickname, role=PlayerRole.HIDER)
    state.players[player_id] = player
    player_lobby[player_id] = state.lobby_code
    return {"lobby_code": state.lobby_code, "player_id": player_id, "host_id": state.host_id}


@router.get("/{code}")
def get_lobby(code: str):
    state = get_game(code)
    if not state:
        raise HTTPException(404, "Lobby nicht gefunden")
    return state


@router.post("/settings")
def update_settings(req: UpdateSettingsRequest):
    from app.services.store import get_game_by_player
    state = get_game_by_player(req.player_id)
    if not state:
        raise HTTPException(404, "Lobby nicht gefunden")
    if state.host_id != req.player_id:
        raise HTTPException(403, "Nur der Host kann Einstellungen ändern")
    state.settings = req.settings
    return {"ok": True}
