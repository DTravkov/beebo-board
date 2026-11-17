import base64
import hashlib
import hmac
from collections.abc import Callable

from ..config import Settings
from ..rooms.service import now_ms


class TurnCredentials:
    def __init__(self, settings: Settings, now: Callable[[], int] = now_ms):
        self.settings = settings
        self.now = now

    def issue(self, member_id: str) -> list[dict]:
        if not self.settings.turn_configured:
            return []
        username = f'{self.now() // 1000 + 3600}:{member_id}'
        credential = hmac.new(
            self.settings.turn_secret.get_secret_value().encode(),
            username.encode(), hashlib.sha1,
        ).digest()
        return [{
            'urls': list(self.settings.relay_urls), 'username': username,
            'credential': base64.b64encode(credential).decode(),
        }]
