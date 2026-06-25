from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.store import get_game, get_game_by_player
from app.models.game import Location, PlayerStatus
import json
import time
import asyncio

router = APIRouter()

# lobby_code -> list of (player_id, websocket)
connections: dict[str, list[tuple[str, WebSocket]]] = {}


async def broadcast(lobby_code: str, message: dict, exclude: str = None):
    for pid, ws in list(connections.get(lobby_code, [])):
        if pid != exclude:
            try:
                await ws.send_json(message)
            except Exception:
                pass


async def game_tick(lobby_code: str):
    """Background task: update zone, pings, check out-of-zone."""
    while True:
        await asyncio.sleep(2)
        state = get_game(lobby_code)
        if not state or state.phase != "playing":
            break

        now = time.time()
        elapsed = now - state.started_at
        total = state.settings.round_duration_minutes * 60

        # Shrink zone
        progress = min(elapsed / total, 1.0)
        start_r = state.settings.start_radius_km
        end_r = state.settings.end_radius_km
        state.current_radius_km = start_r + (end_r - start_r) * progress

        # Shift center toward endpoint
        if state.endpoint and state.center:
            shift = progress * 0.3  # gradually shift
            state.center.lat += (state.endpoint.lat - state.center.lat) * shift * 0.01
            state.center.lng += (state.endpoint.lng - state.center.lng) * shift * 0.01

        # Ping window
        ping_active = False
        if state.next_ping_at and now >= state.next_ping_at:
            if state.ping_until is None:
                state.ping_until = now + state.settings.ping_duration_seconds
                await broadcast(lobby_code, {"type": "ping_start"})
            if now < state.ping_until:
                ping_active = True
            else:
                state.ping_until = None
                state.next_ping_at = now + state.settings.ping_interval_seconds
                await broadcast(lobby_code, {"type": "ping_end"})

        # Build location update (only show hider locations during ping or to seekers)
        locations = {}
        for pid, p in state.players.items():
            if p.location is None:
                continue
            if p.role.value == "seeker" or ping_active:
                locations[pid] = {"lat": p.location.lat, "lng": p.location.lng, "nickname": p.nickname, "role": p.role.value}
            else:
                # Hiders only see their own location + seeker locations
                locations[pid] = None  # filtered per-player below

        # Send state update to each player
        for pid, ws in list(connections.get(lobby_code, [])):
            visible = {}
            player = state.players.get(pid)
            for lpid, ldata in locations.items():
                p = state.players.get(lpid)
                if ldata is None:
                    if lpid == pid:  # always see yourself
                        p2 = state.players.get(lpid)
                        if p2 and p2.location:
                            visible[lpid] = {"lat": p2.location.lat, "lng": p2.location.lng, "nickname": p2.nickname, "role": p2.role.value, "self": True}
                else:
                    visible[lpid] = ldata
            try:
                await ws.send_json({
                    "type": "state",
                    "radius_km": state.current_radius_km,
                    "center": {"lat": state.center.lat, "lng": state.center.lng} if state.center else None,
                    "endpoint": {"lat": state.endpoint.lat, "lng": state.endpoint.lng} if state.endpoint else None,
                    "locations": visible,
                    "ping_active": ping_active,
                    "next_ping_in": max(0, round(state.next_ping_at - now)) if state.next_ping_at else None,
                    "players": {p2id: {"nickname": p2.nickname, "role": p2.role.value, "status": p2.status.value} for p2id, p2 in state.players.items()},
                    "elapsed": round(elapsed),
                    "total": total,
                })
            except Exception:
                pass

        # Check game end
        alive_hiders = [p for p in state.players.values() if p.role.value == "hider" and p.status.value == "alive"]
        if not alive_hiders:
            state.phase = "ended"
            await broadcast(lobby_code, {"type": "game_over", "reason": "all_caught"})
            break

        if elapsed >= total:
            state.phase = "ended"
            await broadcast(lobby_code, {"type": "game_over", "reason": "time_up", "survivors": [p.nickname for p in alive_hiders]})
            break


@router.websocket("/ws/{lobby_code}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, lobby_code: str, player_id: str):
    state = get_game(lobby_code)
    if not state or player_id not in state.players:
        await websocket.close(code=4004)
        return

    await websocket.accept()
    connections.setdefault(lobby_code, []).append((player_id, websocket))

    # If game just started by this connection, launch tick
    tick_task = None
    if state.phase == "playing" and not any(True for _ in []):
        pass  # tick is launched via /api/game/start broadcast

    await broadcast(lobby_code, {
        "type": "player_joined",
        "player_id": player_id,
        "nickname": state.players[player_id].nickname,
    }, exclude=player_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "location":
                # Player sends their GPS position
                p = state.players.get(player_id)
                if p:
                    p.location = Location(lat=data["lat"], lng=data["lng"])

            elif msg_type == "game_started":
                # Host broadcasts start, launch tick
                if state.phase == "playing":
                    tick_task = asyncio.create_task(game_tick(lobby_code))
                    await broadcast(lobby_code, {"type": "game_started"}, exclude=player_id)

            elif msg_type == "catch_confirmed":
                # Forward catch confirmation to all (UI handles display)
                await broadcast(lobby_code, data)

    except WebSocketDisconnect:
        pass
    finally:
        connections[lobby_code] = [(pid, ws) for pid, ws in connections.get(lobby_code, []) if pid != player_id]
        if tick_task:
            tick_task.cancel()
        await broadcast(lobby_code, {"type": "player_left", "player_id": player_id})
