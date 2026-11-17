import unittest

from websockets.exceptions import ConnectionClosed, InvalidStatus

from server.src.rooms.dependencies import get_rooms
from server.src.rooms.repository import InMemoryRoomRepository
from server.src.rooms.service import RoomService
from server.src.shared.dependencies import get_request_policy, get_settings
from server.src.shared.policy import RequestPolicy
from server.tests.helpers import ORIGIN, join, live_server, load_app, settings


class DependencyTests(unittest.TestCase):
    def test_settings_override_reaches_config_rooms_and_turn(self):
        configured = settings(
            direct_connections_enabled=True,
            turn_urls='turn:injected.example:3478', turn_secret='synthetic-secret',
        )
        app = load_app(settings())

        async def override_settings():
            return configured

        app.dependency_overrides[get_settings] = override_settings
        with live_server(app=app) as server:
            self.assertEqual(server.request('/api/config').json(), {
                'turnConfigured': True, 'directEnabled': True, 'maxParticipants': 8,
            })
            command, token = server.create(policy='relay')
            with server.connect() as socket:
                ready = join(socket, command, token)
                self.assertEqual(ready['policy'], 'relay')
                self.assertEqual(ready['iceServers'][0]['urls'], ['turn:injected.example:3478'])

    def test_repository_override_is_shared_across_http_and_websocket_dependencies(self):
        app = load_app(settings(direct_connections_enabled=True))
        repository = InMemoryRoomRepository()

        async def override_repository():
            return repository

        app.dependency_overrides[InMemoryRoomRepository] = override_repository
        with live_server(app=app) as server:
            command, token = server.create()
            self.assertIsNotNone(repository.find(command['roomId']))
            self.assertEqual(server.request('/api/rooms', command).status, 409)
            with server.connect() as socket:
                ready = join(socket, command, token)
                self.assertIn(ready['self'], repository.find(command['roomId']).members)

    def test_service_override_reaches_http_and_signaling_subdependencies(self):
        app = load_app(settings())
        rooms = RoomService(InMemoryRoomRepository(), settings(direct_connections_enabled=True))

        async def override_rooms():
            return rooms

        app.dependency_overrides[get_rooms] = override_rooms
        with live_server(app=app) as server:
            command, token = server.create()
            with server.connect() as socket:
                ready = join(socket, command, token)
                self.assertTrue(rooms.has_member(command['roomId'], ready['self']))

    def test_policy_override_shares_quota_across_http_and_websocket(self):
        app = load_app(settings(
            public_origin='https://unrelated.example', direct_connections_enabled=True,
        ))
        policy = RequestPolicy((ORIGIN,))

        async def override_policy():
            return policy

        app.dependency_overrides[get_request_policy] = override_policy
        with live_server(app=app) as server:
            command, token = server.create()
            with server.connect() as socket:
                join(socket, command, token)
            # Both successful requests have consumed the same budget. Malformed
            # JSON must consume it too, before the body parser rejects the input.
            for _ in range(58):
                self.assertEqual(server.request('/api/rooms', raw=b'{').status, 400)
            self.assertEqual(server.request('/api/rooms', {}).status, 429)
            with self.assertRaises(InvalidStatus):
                server.connect()
            self.assertEqual(server.request().status, 200)

    def test_cleanup_expires_rooms_created_through_request_dependencies(self):
        with live_server(settings(
            direct_connections_enabled=True, room_ttl_ms=1000,
        ), cleanup_interval=0.02) as server:
            command, token = server.create()
            with server.connect() as socket:
                join(socket, command, token)
                with self.assertRaises(ConnectionClosed) as closed:
                    socket.recv(timeout=3)
                self.assertEqual(closed.exception.rcvd.reason, 'Room expired')
            self.assertEqual(server.request('/api/rooms', command).status, 201)

    def test_isolated_application_modules_do_not_share_room_repositories(self):
        with live_server() as first, live_server() as second:
            command, token = first.create()
            with first.connect() as first_socket:
                join(first_socket, command, token)
                self.assertEqual(second.request('/api/rooms', command).status, 201)
                with second.connect() as second_socket:
                    self.assertEqual(join(second_socket, command, token)['peers'], [])
