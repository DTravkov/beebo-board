import base64
import hashlib
import json
import runpy
import secrets
import socket
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

import uvicorn
from websockets.sync.client import connect

from backend.src.config import Settings

ORIGIN = 'http://localhost:5173'


def settings(**values) -> Settings:
    with patch.dict('os.environ', {}, clear=True):
        return Settings(_env_file=None, **values)


def load_app(config: Settings | None = None, *, cleanup_interval=None):
    """Execute the real application module in an isolated test namespace."""
    config = config if config is not None else settings(direct_connections_enabled=True)
    environment = {
        name.upper(): str(value)
        for name, value in config.model_dump().items()
    }
    environment['DIRECT_CONNECTIONS_ENABLED'] = str(config.direct_connections_enabled).lower()
    environment['TURN_SECRET'] = config.turn_secret.get_secret_value()
    # Settings has already resolved a secret file; pass only the resolved secret.
    environment['TURN_SECRET_FILE'] = ''
    with patch.dict('os.environ', environment):
        module = runpy.run_module('backend.src.main')
    if cleanup_interval is not None:
        module['CLEANUP_INTERVAL'] = cleanup_interval
    return module['app']


def invitation() -> tuple[dict, str]:
    token = secrets.token_urlsafe(32)
    verifier = base64.urlsafe_b64encode(hashlib.sha256(token.encode()).digest()).decode().rstrip('=')
    return {'roomId': secrets.token_urlsafe(16), 'verifier': verifier, 'policy': 'all'}, token


@dataclass
class Response:
    status: int
    headers: dict
    body: bytes

    def json(self):
        return json.loads(self.body)


class LiveServer:
    def __init__(self, app, runner, port):
        self.app, self.runner = app, runner
        self.url = f'http://127.0.0.1:{port}'
        self.ws_url = f'ws://127.0.0.1:{port}/signal'

    def request(self, path='/api/health', body=None, origin=ORIGIN, method=None, raw=None, headers=None):
        values = {'content-type': 'application/json', **(headers or {})}
        if origin is not None:
            values['origin'] = origin
        data = json.dumps(body).encode() if body is not None else raw
        request = Request(self.url + path, data=data, headers=values, method=method)
        try:
            response = build_opener(ProxyHandler({})).open(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return Response(response.status, dict(response.headers), response.read())

    def connect(self, **options):
        return connect(self.ws_url, origin=ORIGIN, proxy=None, open_timeout=3, close_timeout=1, **options)

    def create(self, policy='all'):
        command, token = invitation()
        command['policy'] = policy
        response = self.request('/api/rooms', command)
        assert response.status == 201, response.body
        return command, token


@contextmanager
def live_server(config=None, *, app=None, cleanup_interval=None):
    if app is None:
        app = load_app(config, cleanup_interval=cleanup_interval)
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    runner = uvicorn.Server(uvicorn.Config(
        app, log_level='critical', access_log=False, proxy_headers=False,
        ws='websockets', ws_max_size=32_768, ws_max_queue=16,
        ws_per_message_deflate=False, timeout_graceful_shutdown=2,
    ))
    thread = threading.Thread(target=runner.run, kwargs={'sockets': [listener]}, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 5
        while not runner.started:
            if not thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError('Uvicorn did not start')
            time.sleep(0.01)
        yield LiveServer(app, runner, listener.getsockname()[1])
    finally:
        runner.should_exit = True
        thread.join(timeout=5)
        listener.close()
        if thread.is_alive():
            runner.force_exit = True
            raise RuntimeError('Uvicorn did not shut down')


def receive(socket, kind):
    for _ in range(30):
        message = json.loads(socket.recv(timeout=3))
        if message['type'] == kind:
            return message
    raise AssertionError(f'Did not receive {kind}')


def join(socket, command, token):
    socket.send(json.dumps({'type': 'join', 'room': command['roomId'], 'token': token}))
    return receive(socket, 'ready')
