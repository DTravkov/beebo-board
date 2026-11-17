from .models import Room


class InMemoryRoomRepository:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    def find(self, room_id: str) -> Room | None:
        return self.rooms.get(room_id)

    def add(self, room: Room) -> None:
        self.rooms[room.id] = room

    def remove(self, room_id: str) -> None:
        self.rooms.pop(room_id, None)
