from app.models.game import GameState
import random
import string

# In-memory store: lobby_code -> GameState
games: dict[str, GameState] = {}
# player_id -> lobby_code (for quick lookup)
player_lobby: dict[str, str] = {}


def generate_code(length=6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


def create_lobby(host_id: str, nickname: str) -> GameState:
    code = generate_code()
    while code in games:
        code = generate_code()
    from app.models.game import Player, PlayerRole
    host = Player(id=host_id, nickname=nickname, role=PlayerRole.HIDER)
    state = GameState(lobby_code=code, host_id=host_id, players={host_id: host})
    games[code] = state
    player_lobby[host_id] = code
    return state


def get_game(code: str) -> GameState | None:
    return games.get(code.upper())


def get_game_by_player(player_id: str) -> GameState | None:
    code = player_lobby.get(player_id)
    return games.get(code) if code else None
