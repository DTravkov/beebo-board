import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from backend.src.config import Settings
from backend.src.shared.policy import RequestPolicy
from backend.src.signaling.turn_credentials import TurnCredentials
from backend.tests.helpers import settings


class ConfigTests(unittest.TestCase):
    def test_environment_and_fail_closed_turn_configuration(self):
        for values in [
            {'port': 0}, {'port': '3001.5'}, {'port': 65536},
            {'turn_urls': 'stun:relay.example:3478'}, {'turn_urls': 'turn:relay.example:3478'},
            {'turn_secret': 'synthetic-secret'},
            {'turn_secret': 'synthetic-secret', 'turn_secret_file': 'unused'},
            {'turn_urls': 'turn:relay.example:3478', 'turn_secret_file': 'missing-file'},
        ]:
            with self.subTest(values=list(values)), self.assertRaises(ValidationError):
                settings(**values)
        with patch.dict('os.environ', {
            'PUBLIC_ORIGIN': 'https://board.example, https://other.example',
            'TURN_URLS': ' turn:relay.example:3478, turns:relay.example:5349 ',
            'TURN_SECRET': 'synthetic-secret', 'DIRECT_CONNECTIONS_ENABLED': 'true',
        }, clear=True):
            config = Settings(_env_file=None)
        self.assertEqual(config.origins, ('https://board.example', 'https://other.example'))
        self.assertEqual(len(config.relay_urls), 2)
        self.assertTrue(config.direct_connections_enabled)
        self.assertNotIn('synthetic-secret', repr(config))
        for value in ['TRUE', '1', 'yes', 'false']:
            self.assertFalse(settings(direct_connections_enabled=value).direct_connections_enabled)

    def test_secret_file_and_dotenv_are_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            secret_file = Path(directory) / 'turn-secret'
            secret_file.write_text('  synthetic-secret\n', encoding='utf-8')
            config = settings(turn_urls='turn:relay.example:3478', turn_secret_file=str(secret_file))
            self.assertEqual(config.turn_secret.get_secret_value(), 'synthetic-secret')
            dotenv = Path(directory) / '.env'
            dotenv.write_text('PORT=4321\nDIRECT_CONNECTIONS_ENABLED=true\nAPP_DOMAIN=ignored.example\n', encoding='utf-8')
            with patch.dict('os.environ', {}, clear=True):
                config = Settings(_env_file=dotenv)
            self.assertEqual(config.port, 4321)
            self.assertTrue(config.direct_connections_enabled)

    def test_turn_credentials_use_one_hour_hmac_format(self):
        config = settings(turn_urls='turn:relay.example:3478', turn_secret='synthetic-operator-secret')
        turn = TurnCredentials(config, lambda: 1_000_000)
        import base64
        import hashlib
        import hmac
        expected = base64.b64encode(hmac.new(b'synthetic-operator-secret', b'4600:member-one', hashlib.sha1).digest()).decode()
        self.assertEqual(turn.issue('member-one'), [{
            'urls': ['turn:relay.example:3478'], 'username': '4600:member-one', 'credential': expected,
        }])
        self.assertEqual(TurnCredentials(settings()).issue('a'), [])

    def test_request_policy_bounds_and_resets_tracking(self):
        now = 0
        policy = RequestPolicy(('https://board.example',), lambda: now)
        self.assertFalse(policy.allows_origin(None))
        self.assertFalse(policy.allows_origin('https://untrusted.example'))
        self.assertTrue(policy.allows_origin('https://board.example'))
        for _ in range(60):
            self.assertTrue(policy.allows_attempt('same-ip'))
        self.assertFalse(policy.allows_attempt('same-ip'))
        for index in range(1, 10_000):
            self.assertTrue(policy.allows_attempt(f'ip-{index}'))
        self.assertFalse(policy.allows_attempt('overflow'))
        now = 60.001
        policy.prune()
        self.assertTrue(policy.allows_attempt('same-ip'))
        self.assertTrue(policy.allows_attempt('overflow'))
