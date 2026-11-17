import unittest

from server.src.rooms.exceptions import RoomError
from server.src.rooms.repository import InMemoryRoomRepository
from server.src.rooms.schemas import CreateRoom
from server.src.rooms.service import RoomService
from server.src.signaling.repository import InMemoryConnectionRepository
from server.src.signaling.service import SignalingService
from server.tests.helpers import invitation, settings


class RoomServiceTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.repository = InMemoryRoomRepository()
        self.rooms = RoomService(self.repository, settings(direct_connections_enabled=True), lambda: self.now)
        command, self.token = invitation()
        self.command = CreateRoom(**command)
        self.rooms.create(self.command)

    def test_admission_capacity_and_departure(self):
        with self.assertRaisesRegex(RoomError, 'already exists'):
            self.rooms.create(self.command)
        with self.assertRaisesRegex(RoomError, 'unavailable'):
            self.rooms.admit(self.command.roomId, 'wrong-token')
        members = []
        for index in range(8):
            admission = self.rooms.admit(self.command.roomId, self.token)
            self.assertEqual(len(admission.peers), index)
            members.append(admission.membership)
        with self.assertRaisesRegex(RoomError, 'full'):
            self.rooms.admit(self.command.roomId, self.token)
        self.rooms.leave(members[0])
        self.assertEqual(len(self.rooms.admit(self.command.roomId, self.token).peers), 7)
        for index in range(1, 250):
            self.rooms.create(self.command.model_copy(update={'roomId': f'room-{index:016}'}))
        with self.assertRaisesRegex(RoomError, 'server is full'):
            self.rooms.create(self.command.model_copy(update={'roomId': 'overflow-room-0001'}))

    def test_empty_retention_starts_at_last_departure(self):
        member = self.rooms.admit(self.command.roomId, self.token).membership
        self.now = 11 * 60_000
        self.assertEqual(self.rooms.remove_expired(), [])
        self.assertEqual(len(self.repository.rooms), 1)
        self.rooms.leave(member)
        self.now += 10 * 60_000
        self.rooms.remove_expired()
        self.assertEqual(len(self.repository.rooms), 1)
        self.now += 1
        self.rooms.remove_expired()
        self.assertEqual(len(self.repository.rooms), 0)

    def test_expiry_closes_members_and_late_disconnect_does_not_change_recreated_room(self):
        messages, reasons = [], []

        class Connection:
            def send(self, message):
                messages.append(message)

            def close(self, reason, code=1008):
                reasons.append(reason)

        connections = InMemoryConnectionRepository()
        signaling = SignalingService(self.rooms, connections, lambda _member: [])
        old = signaling.join(self.command.roomId, self.token, Connection())
        self.now = self.rooms.settings.room_ttl_ms + 1
        with self.assertRaisesRegex(RoomError, 'unavailable'):
            self.rooms.admit(self.command.roomId, self.token)
        signaling.expire_rooms()
        self.assertEqual(reasons, ['Room expired'])
        self.rooms.create(self.command)
        new = signaling.join(self.command.roomId, self.token, Connection())
        signaling.leave(old)
        self.assertTrue(self.rooms.has_member(new.room_id, new.member_id))
        self.assertIsNotNone(connections.find(new.member_id))
        self.assertFalse(any(message['type'] == 'peer-left' for message in messages))
