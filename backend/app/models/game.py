from pydantic import BaseModel
from typing import Optional
from enum import Enum
import math


class GameMode(str, Enum):
    ELIMINATION = "elimination"
    INFECTION = "infection"


class PlayerRole(str, Enum):
    HIDER = "hider"
    SEEKER = "seeker"
    SPECTATOR = "spectator"


class PlayerStatus(str, Enum):
    ALIVE = "alive"
    CAUGHT = "caught"
    OUT_OF_ZONE = "out_of_zone"
    WINNER = "winner"


class Location(BaseModel):
    lat: float
    lng: float


class Player(BaseModel):
    id: str
    nickname: str
    role: PlayerRole = PlayerRole.HIDER
    status: PlayerStatus = PlayerStatus.ALIVE
    location: Optional[Location] = None
    location_visible: bool = False  # during ping window


class LobbySettings(BaseModel):
    game_mode: GameMode = GameMode.ELIMINATION
    start_radius_km: float = 5.0
    end_radius_km: float = 0.5
    round_duration_minutes: int = 30
    seeker_count: int = 1
    ping_interval_seconds: int = 120   # every 2 min
    ping_duration_seconds: int = 10    # visible for 10s
    out_of_zone_seconds: int = 60
    endpoint_hold_seconds: int = 60
    endpoint_random: bool = True       # random or fixed


class GameState(BaseModel):
    lobby_code: str
    host_id: str
    phase: str = "lobby"  # lobby | playing | ended
    settings: LobbySettings = LobbySettings()
    players: dict[str, Player] = {}
    center: Optional[Location] = None
    endpoint: Optional[Location] = None
    current_radius_km: float = 5.0
    started_at: Optional[float] = None
    next_ping_at: Optional[float] = None
    ping_until: Optional[float] = None


def haversine_distance_m(a: Location, b: Location) -> float:
    """Returns distance in metres between two GPS coordinates."""
    R = 6371000
    phi1 = math.radians(a.lat)
    phi2 = math.radians(b.lat)
    dphi = math.radians(b.lat - a.lat)
    dlambda = math.radians(b.lng - a.lng)
    x = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))
