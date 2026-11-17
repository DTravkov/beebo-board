MESSAGES = {
    'turn-required': 'The operator has not configured TURN yet. You can keep working privately on this device.',
    'direct-disabled': 'Direct connections are disabled by the operator.',
    'server-full': 'The server is full. Please try later.',
    'room-exists': 'That room already exists.',
    'unavailable': 'Room unavailable or invitation invalid',
    'room-full': 'Room is full (8 people)',
}
STATUS_CODES = {'turn-required': 503, 'direct-disabled': 403, 'server-full': 503, 'room-exists': 409}


class RoomError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(MESSAGES[code])

    @property
    def status_code(self) -> int:
        return STATUS_CODES.get(self.code, 403)
