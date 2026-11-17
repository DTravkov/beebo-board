import tempfile
import unittest
from pathlib import Path

from backend.tests.helpers import live_server, settings


class StaticFilesTests(unittest.TestCase):
    def test_frontend_files_headers_and_api_route_priority(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_text('<html>Test client</html>', encoding='utf-8')
            assets = root / 'assets'
            assets.mkdir()
            (assets / 'app.js').write_text('console.log(1);', encoding='utf-8')
            (assets / 'app.css').write_text('body {}', encoding='utf-8')
            api = root / 'api'
            api.mkdir()
            (api / 'config').write_text('Static file must not replace the API', encoding='utf-8')
            (api / 'private.txt').write_text('Static file must not enter the API namespace', encoding='utf-8')
            (root / 'signal').write_text('Static file must not replace signaling', encoding='utf-8')
            with live_server(settings(client_dist=root)) as server:
                index = server.request('/')
                self.assertEqual(index.status, 200)
                self.assertEqual(index.body, b'<html>Test client</html>')
                self.assertIn('text/html', index.headers['content-type'])
                self.assertEqual(index.headers['cache-control'], 'no-store')
                self.assertEqual(index.headers['x-content-type-options'], 'nosniff')
                script = server.request('/assets/app.js')
                self.assertEqual(script.status, 200)
                self.assertIn('javascript', script.headers['content-type'])
                css = server.request('/assets/app.css')
                self.assertEqual(css.status, 200)
                self.assertIn('text/css', css.headers['content-type'])
                head = server.request('/assets/app.js', method='HEAD')
                self.assertEqual(head.status, 200)
                self.assertEqual(head.body, b'')
                self.assertEqual(head.headers['content-length'], script.headers['content-length'])
                self.assertEqual(server.request('/api/config').json()['maxParticipants'], 8)
                self.assertEqual(server.request('/api/private.txt').status, 404)
                self.assertEqual(server.request('/signal').status, 404)
                for path in ['/assets/absent.js', '/unknown-page']:
                    response = server.request(path, headers={'Accept': 'text/html'})
                    self.assertEqual(response.status, 404)
                    self.assertEqual(response.json(), {'error': 'Not found.'})

    def test_paths_cannot_escape_the_build_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'dist'
            root.mkdir()
            (Path(directory) / 'private.txt').write_text('synthetic-private-file', encoding='utf-8')
            with live_server(settings(client_dist=root)) as server:
                for path in ['/../private.txt', '/%2e%2e/private.txt', '/..%5cprivate.txt', '/%00']:
                    response = server.request(path)
                    self.assertEqual(response.status, 404)
                    self.assertNotIn(b'synthetic-private-file', response.body)

    def test_symlinks_cannot_expose_files_outside_the_build_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'dist'
            root.mkdir()
            private = Path(directory) / 'private.txt'
            private.write_text('synthetic-private-file', encoding='utf-8')
            try:
                (root / 'linked.txt').symlink_to(private)
            except OSError:
                self.skipTest('This environment does not permit creating symlinks.')
            with live_server(settings(client_dist=root)) as server:
                response = server.request('/linked.txt')
                self.assertEqual(response.status, 404)
                self.assertNotIn(b'synthetic-private-file', response.body)

    def test_backend_runs_without_a_frontend_build(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / 'not-built'
            with live_server(settings(client_dist=missing)) as server:
                self.assertEqual(server.request().status, 200)
                self.assertEqual(server.request('/api/config').json()['maxParticipants'], 8)
                self.assertEqual(server.request('/').status, 404)
                self.assertEqual(server.request('/assets/app.js').status, 404)
