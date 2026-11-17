from dataclasses import dataclass, field

from .constants import EMPTY_ROOM_TTL_MS, MAX_PARTICIPANTS
from .exceptions import RoomError
from .schemas import ConnectionPolicy


@dataclass
class Room:
    id: str
    verifier: bytes = field(repr=False)
    policy: ConnectionPolicy
    created_at: int
    lifetime_ms: int
    members: dict[str, None] = field(default_factory=dict)
    last_active: int = field(init=False)

    def __post_init__(self) -> None:
        self.last_active = self.created_at

    @property
    def expires_at(self) -> int:
        return self.created_at + self.lifetime_ms

    def is_expired(self, now: int) -> bool:
        return now > self.expires_at

    def should_remove(self, now: int) -> bool:
        return self.is_expired(now) or (not self.members and now - self.last_active > EMPTY_ROOM_TTL_MS)

    def join(self, member_id: str, now: int) -> list[str]:
        if self.is_expired(now):
            raise RoomError('unavailable')
        if len(self.members) >= MAX_PARTICIPANTS:
            raise RoomError('room-full')
        peers = list(self.members)
        self.members[member_id] = None
        self.last_active = now
        return peers


@dataclass(frozen=True)
class Membership:
    room_id: str
    member_id: str


@dataclass(frozen=True)
class Admission:
    membership: Membership
    peers: list[str]
    policy: ConnectionPolicy
    expires_at: int
