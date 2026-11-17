from typing import Protocol








class SignalingConnection(Protocol):
    def send(self, message: dict) -> None: ...
    def close(self, reason: str, code: int = 1008) -> None: ...


class InMemoryConnectionRepository:
    def __init__(self) -> None:
        self.connections: dict[str, SignalingConnection] = {}
        # Includes sockets waiting for admission, so they count toward capacity
        # and are closed during application shutdown.
        self.active: set[SignalingConnection] = set()

    def find(self, member_id: str) -> SignalingConnection | None:
        return self.connections.get(member_id)

    def add(self, member_id: str, connection: SignalingConnection) -> None:
        self.connections[member_id] = connection

    def remove(self, member_id: str) -> None:
        self.connections.pop(member_id, None)
