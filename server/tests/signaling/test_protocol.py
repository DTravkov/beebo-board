import json
import unittest
from contextlib import ExitStack
from unittest.mock import patch

from websockets.exceptions import ConnectionClosed, InvalidStatus

from server.src.signaling.connection import MAX_QUEUED_BYTES, WebSocketConnection
from server.tests.helpers import ORIGIN, join, live_server, receive, settings


class SignalingTests(unittest.TestCase):
    def test_routing_sender_identity_room_isolation_and_departures(self):
        with live_server() as server, ExitStack() as stack:
            command, token = server.create()
            a = stack.enter_context(server.connect())
            ready_a = join(a, command, token)
            b = stack.enter_context(server.connect())
            ready_b = join(b, command, token)
            other_command, other_token = server.create()
            outsider = stack.enter_context(server.connect())
            ready_outsider = join(outsider, other_command, other_token)
            self.assertEqual(ready_a['peers'], [])
            self.assertEqual(ready_b['peers'], [ready_a['self']])
            self.assertEqual(receive(a, 'peer-joined')['peer'], ready_b['self'])
            for signal in [
                {'type': 'offer', 'sdp': 'synthetic-offer'},
                {'type': 'answer', 'sdp': 'synthetic-answer'},
                {'type': 'candidate', 'candidate': {'candidate': 'synthetic-candidate'}},
            ]:
                a.send(json.dumps({'type': 'signal', 'to': ready_b['self'], 'from': ready_outsider['self'], 'signal': signal}))
                self.assertEqual(receive(b, 'signal'), {'type': 'signal', 'from': ready_a['self'], 'signal': signal})
            for target in [ready_outsider['self'], ready_a['self'], 'unknown-member']:
                a.send(json.dumps({'type': 'signal', 'to': target, 'signal': {'type': 'offer', 'sdp': 'x'}}))
            a.send('{"type":"ping"}')
            self.assertEqual(json.loads(a.recv(timeout=3)), {'type': 'pong'})
            outsider.send('{"type":"ping"}')
            self.assertEqual(json.loads(outsider.recv(timeout=3)), {'type': 'pong'})
            b.close()
            self.assertEqual(receive(a, 'peer-left')['peer'], ready_b['self'])
            replacement = stack.enter_context(server.connect())
            self.assertEqual(join(replacement, command, token)['peers'], [ready_a['self']])

    def test_invalid_admission_capacity_and_temporary_turn_credentials(self):
        config = settings(turn_urls='turn:relay.example:3478', turn_secret='synthetic-secret', direct_connections_enabled=True)
        with live_server(config) as server, ExitStack() as stack:
            command, token = server.create(policy='relay')
            rejected = stack.enter_context(server.connect())
            rejected.send(json.dumps({'type': 'join', 'room': command['roomId'], 'token': 'x' * 43}))
            with self.assertRaises(ConnectionClosed) as closed:
                rejected.recv(timeout=3)
            self.assertEqual(closed.exception.rcvd.code, 1008)
            self.assertNotIn('iceServers', server.request('/api/config').json())
            for index in range(8):
                member = stack.enter_context(server.connect())
                ready = join(member, command, token)
                self.assertEqual(len(ready['peers']), index)
                self.assertEqual(ready['policy'], 'relay')
                self.assertEqual(ready['iceServers'][0]['urls'], ['turn:relay.example:3478'])
                self.assertNotIn('synthetic-secret', json.dumps(ready))
            ninth = stack.enter_context(server.connect())
            ninth.send(json.dumps({'type': 'join', 'room': command['roomId'], 'token': token}))
            with self.assertRaises(ConnectionClosed) as closed:
                ninth.recv(timeout=3)
            self.assertIn('full', closed.exception.rcvd.reason)

    def test_malformed_binary_and_oversize_messages(self):
        with live_server() as server:
            for raw, reason, code in [
                ('{', 'Invalid message', 1008), ('[]', 'Invalid message', 1008),
                ('{"type":"ping"}', 'Invalid admission', 1008),
                (b'binary', 'Text signaling required', 1008),
                ('x' * 32_769, None, 1009),
                ('{"value":NaN}', 'Invalid message', 1008),
            ]:
                with self.subTest(reason=reason), server.connect() as socket:
                    socket.send(raw)
                    with self.assertRaises(ConnectionClosed) as closed:
                        socket.recv(timeout=3)
                    self.assertEqual(closed.exception.rcvd.code, code)
                    if reason:
                        self.assertEqual(closed.exception.rcvd.reason, reason)

    def test_malformed_member_messages_and_message_quota(self):
        with live_server() as server:
            command, token = server.create()
            with server.connect() as healthy:
                ready = join(healthy, command, token)
                for signal, reason in [(None, 'Invalid signaling'), ({'type': 'unknown'}, 'Unsupported signal')]:
                    with server.connect() as socket:
                        join(socket, command, token)
                        socket.send(json.dumps({'type': 'signal', 'to': ready['self'], 'signal': signal}))
                        with self.assertRaises(ConnectionClosed) as closed:
                            receive(socket, 'pong')
                        self.assertEqual(closed.exception.rcvd.reason, reason)
                with server.connect() as socket:
                    join(socket, command, token)
                    for _ in range(101):
                        socket.send('{"type":"ping"}')
                    with self.assertRaises(ConnectionClosed) as closed:
                        while True:
                            socket.recv(timeout=3)
                    self.assertEqual(closed.exception.rcvd.reason, 'Rate limit')
                healthy.send('{"type":"ping"}')
                self.assertEqual(receive(healthy, 'pong'), {'type': 'pong'})

    def test_shared_http_upgrade_quota_and_upgrade_policy(self):
        from websockets.sync.client import connect
        with live_server() as server:
            for origin in [None, 'https://untrusted.example']:
                with self.assertRaises(InvalidStatus) as rejected:
                    connect(server.ws_url, origin=origin, proxy=None)
                self.assertEqual(rejected.exception.response.status_code, 403)
            for path in ['/wrong', '/signal?extra=1']:
                with self.assertRaises(InvalidStatus):
                    connect(server.ws_url.replace('/signal', path), origin=ORIGIN, proxy=None)
            for _ in range(59):
                self.assertEqual(server.request('/api/rooms', {}).status, 400)
            with server.connect():
                self.assertEqual(server.request('/api/rooms', {}).status, 429)
                self.assertEqual(server.request().status, 200)
                with self.assertRaises(InvalidStatus):
                    server.connect()

    def test_join_deadline_and_shutdown_with_unadmitted_socket(self):
        with patch('server.src.signaling.router.JOIN_TIMEOUT', 0.1), live_server() as server:
            with server.connect() as socket:
                with self.assertRaises(ConnectionClosed) as closed:
                    socket.recv(timeout=3)
                self.assertEqual(closed.exception.rcvd.reason, 'Join required')
        with live_server() as server:
            socket = server.connect()
        try:
            with self.assertRaises(ConnectionClosed):
                socket.recv(timeout=3)
        finally:
            socket.close()

    def test_outbound_queue_is_bounded_and_closes_slow_connection(self):
        connection = WebSocketConnection(None)
        for _ in range(100):
            connection.send({'type': 'signal', 'signal': {'sdp': 'x' * 32_000}})
        self.assertEqual(connection.close_reason, 'Slow connection')
        self.assertLessEqual(connection.queued_bytes, MAX_QUEUED_BYTES)
        self.assertEqual(connection.queue.qsize(), 1)
