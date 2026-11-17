import re
from pathlib import Path

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env', extra='ignore', frozen=True, hide_input_in_errors=True,
    )

    host: str = '127.0.0.1'
    port: int = Field(default=3001, ge=1, le=65535)
    public_origin: str = (
        'http://127.0.0.1:5173,http://localhost:5173,'
        'http://127.0.0.1:3001,http://localhost:3001'
    )
    turn_urls: str = ''
    turn_secret: SecretStr = Field(default=SecretStr(''), repr=False)
    turn_secret_file: str = Field(default='', repr=False)
    direct_connections_enabled: bool = False
    room_ttl_ms: int = Field(default=2 * 60 * 60 * 1000, gt=0)
    client_dist: Path = Path('frontend/dist')

    @field_validator('direct_connections_enabled', mode='before')
    @classmethod
    def explicit_direct_mode(cls, value: object) -> bool:
        return value is True or value == 'true'

    @model_validator(mode='after')
    def validate_turn(self) -> 'Settings':
        secret = self.turn_secret.get_secret_value()
        if secret and self.turn_secret_file:
            raise ValueError('Set TURN_SECRET_FILE or TURN_SECRET, not both.')
        if self.turn_secret_file:
            try:
                secret = Path(self.turn_secret_file).read_text(encoding='utf-8').strip()
            except OSError:
                raise ValueError('Could not read TURN_SECRET_FILE.') from None
            object.__setattr__(self, 'turn_secret', SecretStr(secret))
        if any(not re.fullmatch(r'turns?:[^\s]+', url) for url in self.relay_urls):
            raise ValueError('TURN_URLS must contain turn: or turns: URLs.')
        if bool(self.relay_urls) != bool(secret):
            raise ValueError('Configure both TURN_URLS and TURN_SECRET.')
        return self

    @property
    def origins(self) -> tuple[str, ...]:
        return tuple(value.strip() for value in self.public_origin.split(',') if value.strip())

    @property
    def relay_urls(self) -> tuple[str, ...]:
        return tuple(value.strip() for value in self.turn_urls.split(',') if value.strip())

    @property
    def turn_configured(self) -> bool:
        return bool(self.relay_urls and self.turn_secret.get_secret_value())
