import base64
import hashlib
import hmac
import time
from collections.abc import Callable
from uuid import uuid4

from ..config import Settings
from .constants import MAX_ROOMS
from .exceptions import RoomError
from .models import Admission, Membership, Room
from .repository import InMemoryRoomRepository
from .schemas import CreateRoom


def now_ms() -> int:
    return int(time.time() * 1000)


class RoomService:
    """Synchronous operations keep membership changes atomic on the ASGI event loop."""

    def __init__(
        self, repository: InMemoryRoomRepository, settings: Settings,
        now: Callable[[], int] = now_ms, member_id: Callable[[], str] = lambda: str(uuid4()),
    ):
        self.repository = repository
        self.settings = settings
        self.now = now
        self.member_id = member_id

    def create(self, command: CreateRoom) -> dict[str, str]:
        if command.policy == 'relay' and not self.settings.turn_configured:
            raise RoomError('turn-required')
        if command.policy == 'all' and not self.settings.direct_connections_enabled:
            raise RoomError('direct-disabled')
        if len(self.repository.rooms) >= MAX_ROOMS:
            raise RoomError('server-full')
        if self.repository.find(command.roomId):
            raise RoomError('room-exists')
        self.repository.add(Room(
            command.roomId, base64.urlsafe_b64decode(command.verifier + '='),
            command.policy, self.now(), self.settings.room_ttl_ms,
        ))
        return {'roomId': command.roomId}

    def admit(self, room_id: str, token: str) -> Admission:
        room = self.repository.find(room_id)
        now = self.now()
        if not room or room.is_expired(now) or not hmac.compare_digest(
            room.verifier, hashlib.sha256(token.encode()).digest(),
        ):
            raise RoomError('unavailable')
        member_id = self.member_id()
        peers = room.join(member_id, now)
        return Admission(Membership(room_id, member_id), peers, room.policy, room.expires_at)

    def has_member(self, room_id: str, member_id: str) -> bool:
        room = self.repository.find(room_id)
        return bool(room and member_id in room.members)

    def touch(self, membership: Membership) -> None:
        room = self.repository.find(membership.room_id)
        if room and membership.member_id in room.members:
            room.last_active = self.now()

    def leave(self, membership: Membership) -> list[str]:
        room = self.repository.find(membership.room_id)
        if not room or membership.member_id not in room.members:
            return []
        del room.members[membership.member_id]
        room.last_active = self.now()
        return list(room.members)

    def remove_expired(self) -> list[str]:
        members: list[str] = []
        for room in list(self.repository.rooms.values()):
            if room.should_remove(self.now()):
                members.extend(room.members)
                self.repository.remove(room.id)
        return members
