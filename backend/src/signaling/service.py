from collections.abc import Callable

from ..rooms.models import Membership
from ..rooms.service import RoomService
from .repository import InMemoryConnectionRepository, SignalingConnection
from .schemas import PingMessage, SignalMessage


class SignalingService:
    def __init__(
        self, rooms: RoomService, connections: InMemoryConnectionRepository,
        issue_ice_servers: Callable[[str], list[dict]],
    ):
        self.rooms = rooms
        self.connections = connections
        self.issue_ice_servers = issue_ice_servers

    def send(self, member_id: str, message: dict) -> None:
        connection = self.connections.find(member_id)
        if connection:
            connection.send(message)

    def join(self, room_id: str, token: str, connection: SignalingConnection) -> Membership:
        admission = self.rooms.admit(room_id, token)
        member_id = admission.membership.member_id
        self.connections.add(member_id, connection)
        connection.send({
            'type': 'ready', 'self': member_id, 'peers': admission.peers,
            'policy': admission.policy, 'iceServers': self.issue_ice_servers(member_id),
            'expiresAt': admission.expires_at,
        })
        for peer in admission.peers:
            self.send(peer, {'type': 'peer-joined', 'peer': member_id})
        return admission.membership

    def handle(self, membership: Membership, message: PingMessage | SignalMessage) -> None:
        if not self.rooms.has_member(membership.room_id, membership.member_id):
            return
        self.rooms.touch(membership)
        if isinstance(message, PingMessage):
            self.send(membership.member_id, {'type': 'pong'})
        elif message.to != membership.member_id and self.rooms.has_member(membership.room_id, message.to):
            self.send(message.to, {
                'type': 'signal', 'from': membership.member_id,
                'signal': message.signal.model_dump(),
            })

    def leave(self, membership: Membership) -> None:
        self.connections.remove(membership.member_id)
        for peer in self.rooms.leave(membership):
            self.send(peer, {'type': 'peer-left', 'peer': membership.member_id})

    def expire_rooms(self) -> None:
        for member_id in self.rooms.remove_expired():
            connection = self.connections.find(member_id)
            if connection:
                connection.close('Room expired')
