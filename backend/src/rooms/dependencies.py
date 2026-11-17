import asyncio
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from starlette.requests import ClientDisconnect

from ..shared.dependencies import RequestPolicyDependency, SettingsDependency
from .repository import InMemoryRoomRepository
from .schemas import CreateRoom
from .service import RoomService

HTTP_BODY_TIMEOUT = 10
RoomRepositoryDependency = Annotated[InMemoryRoomRepository, Depends(InMemoryRoomRepository)]


async def get_rooms(repository: RoomRepositoryDependency, settings: SettingsDependency) -> RoomService:
    return RoomService(repository, settings)


RoomsDependency = Annotated[RoomService, Depends(get_rooms)]


async def require_room_creation(request: Request, policy: RequestPolicyDependency) -> None:
    if not policy.allows_origin(request.headers.get('origin')):
        raise HTTPException(403, 'Origin not allowed.')
    if not policy.allows_attempt(request.client.host if request.client else 'unknown'):
        raise HTTPException(429, 'Too many room requests. Try again in a minute.')


async def get_create_room_command(
    request: Request,
    _admission: Annotated[None, Depends(require_room_creation)],
) -> CreateRoom:
    # Read only after admission dependencies succeed. Declaring Body() here would
    # make FastAPI read/parse it before origin and quota checks run.
    async def read_body() -> bytes:
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > 4096:
                raise OverflowError
            body.extend(chunk)
        return bytes(body)

    try:
        content_length = int(request.headers.get('content-length', '0'))
        if content_length < 0:
            raise ValueError
        if content_length > 4096:
            raise OverflowError
        body = await asyncio.wait_for(read_body(), timeout=HTTP_BODY_TIMEOUT)
        content_type = request.headers.get('content-type', '').split(';', 1)[0].strip().lower()
        if content_type != 'application/json' and not (
            content_type.startswith('application/') and content_type.endswith('+json')
        ):
            raise ValueError
        return CreateRoom.model_validate_json(body)
    except OverflowError:
        raise HTTPException(413, 'Request body too large.') from None
    except (ValueError, asyncio.TimeoutError, ClientDisconnect):
        raise HTTPException(400, 'Invalid room request.') from None


CreateRoomDependency = Annotated[CreateRoom, Depends(get_create_room_command)]
