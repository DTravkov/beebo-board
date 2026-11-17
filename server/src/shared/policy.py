import time
from collections.abc import Callable


class RequestPolicy:
    """HTTP room creation and WebSocket upgrades share a bounded IP budget."""

    def __init__(self, origins: tuple[str, ...], now: Callable[[], float] = time.monotonic):
        self.origins = frozenset(origins)
        self.now = now
        self.attempts: dict[str, tuple[int, float]] = {}

    def allows_origin(self, origin: str | None) -> bool:
        return origin in self.origins

    def allows_attempt(self, ip: str) -> bool:
        now = self.now()
        count, until = self.attempts.get(ip, (0, 0))
        if ip not in self.attempts or until < now:
            if ip not in self.attempts and len(self.attempts) >= 10_000:
                return False
            count, until = 0, now + 60
        self.attempts[ip] = (count + 1, until)
        return count < 60

    def prune(self) -> None:
        now = self.now()
        self.attempts = {ip: entry for ip, entry in self.attempts.items() if entry[1] >= now}
