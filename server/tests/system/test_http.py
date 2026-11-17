import unittest
from http.client import HTTPConnection
from unittest.mock import patch

from server.tests.helpers import invitation, live_server, load_app, settings


class HttpTests(unittest.TestCase):
    def test_safe_defaults_origin_validation_and_headers(self):
        with live_server(settings()) as server:
            command, _ = invitation()
            self.assertEqual(server.request('/api/rooms', {**command, 'policy': 'relay'}).status, 503)
            self.assertEqual(server.request('/api/rooms', command).status, 403)
            self.assertEqual(server.request('/api/rooms', command, origin='https://untrusted.example').status, 403)
            self.assertEqual(server.request('/api/rooms', command, origin=None).status, 403)
            for body in [{}, [], {**command, 'verifier': 'bad'}, {**command, 'roomId': 123}]:
                self.assertEqual(server.request('/api/rooms', body).status, 400)
            public = server.request('/api/config').json()
            self.assertEqual(public, {'turnConfigured': False, 'directEnabled': False, 'maxParticipants': 8})
            for response in [server.request(), server.request('/api/missing'), server.request('/missing', method='DELETE')]:
                headers = {key.lower(): value for key, value in response.headers.items()}
                self.assertEqual(headers['cache-control'], 'no-store')
                self.assertEqual(headers['referrer-policy'], 'no-referrer')
                self.assertIn("frame-ancestors 'none'", headers['content-security-policy'])

    def test_body_limits_malformed_json_and_duplicate_rooms(self):
        with live_server() as server:
            command, _ = server.create()
            self.assertEqual(server.request('/api/rooms', command).status, 409)
            for raw in [b'{', b'null', b'[]', b'{"roomId": NaN}', b'[' * 1500 + b']' * 1500]:
                response = server.request('/api/rooms', raw=raw)
                self.assertEqual(response.status, 400)
                self.assertEqual(response.json(), {'error': 'Invalid room request.'})
            response = server.request('/api/rooms', raw=b'x' * 4097)
            self.assertEqual(response.status, 413)
            self.assertEqual(response.headers['cache-control'], 'no-store')
            self.assertEqual(server.request('/api/missing').json(), {'error': 'Not found.'})

    def test_application_instances_are_isolated(self):
        with live_server() as first, live_server(settings()) as second:
            command, _ = first.create()
            self.assertEqual(second.request('/api/rooms', command).status, 403)
            self.assertTrue(first.request('/api/config').json()['directEnabled'])
            self.assertFalse(second.request('/api/config').json()['directEnabled'])

    def test_chunked_body_limits_and_body_timeout(self):
        with live_server() as server:
            connection = HTTPConnection(server.url.removeprefix('http://'), timeout=3)
            try:
                connection.request('POST', '/api/rooms', body=iter([b'x' * 2048] * 3),
                                   headers={'Origin': 'http://localhost:5173', 'Content-Type': 'application/json'},
                                   encode_chunked=True)
                response = connection.getresponse()
                self.assertEqual(response.status, 413)
                response.read()
            finally:
                connection.close()
        with patch('server.src.rooms.dependencies.HTTP_BODY_TIMEOUT', 0.05), live_server() as server:
            connection = HTTPConnection(server.url.removeprefix('http://'), timeout=3)
            try:
                connection.putrequest('POST', '/api/rooms')
                connection.putheader('Origin', 'http://localhost:5173')
                connection.putheader('Content-Type', 'application/json')
                connection.putheader('Content-Length', '10')
                connection.endheaders()
                response = connection.getresponse()
                self.assertEqual(response.status, 400)
                response.read()
            finally:
                connection.close()

    def test_telemetry_stays_disabled_even_if_environment_requests_it(self):
        with patch.dict('os.environ', {'FASTAPI_OTEL_AUTO_CONFIGURE': 'true'}):
            app = load_app(settings())
        self.assertFalse(app._native_telemetry.enabled())
        self.assertFalse(app._telemetry['auto_configure'])

    def test_origin_rejection_happens_before_waiting_for_the_body(self):
        with live_server() as server:
            connection = HTTPConnection(server.url.removeprefix('http://'), timeout=1)
            try:
                connection.putrequest('POST', '/api/rooms')
                connection.putheader('Origin', 'https://untrusted.example')
                connection.putheader('Content-Type', 'application/json')
                connection.putheader('Content-Length', '10000')
                connection.endheaders()
                response = connection.getresponse()
                self.assertEqual(response.status, 403)
                response.read()
            finally:
                connection.close()
