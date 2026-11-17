from fastapi import APIRouter

from .dependencies import CreateRoomDependency, RoomsDependency
from .schemas import CreatedRoom, CreateRoom

router = APIRouter(prefix='/api/rooms', tags=['rooms'])


@router.post(
    '', status_code=201, response_model=CreatedRoom,
    openapi_extra={'requestBody': {'required': True, 'content': {
        'application/json': {'schema': CreateRoom.model_json_schema()},
    }}},
)
async def create_room(command: CreateRoomDependency, rooms: RoomsDependency):
    return rooms.create(command)
