import asyncio
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..rooms.constants import MAX_PARTICIPANTS, MAX_ROOMS
from ..rooms.exceptions import RoomError
from ..rooms.models import Membership
from ..shared.dependencies import RequestPolicyDependency
from .connection import MAX_PAYLOAD, WebSocketConnection
from .dependencies import ConnectionRepositoryDependency, SignalingDependency
from .exceptions import ProtocolError
from .schemas import parse_admission, parse_member_message, parse_message

router = APIRouter(tags=['signaling'])
JOIN_TIMEOUT = 5


@router.websocket('/signal')
async def signal(
    socket: WebSocket,
    signaling: SignalingDependency,
    connections: ConnectionRepositoryDependency,
    policy: RequestPolicyDependency,
) -> None:


    ip = socket.client.host if socket.client else 'unknown'

    if (socket.scope.get('query_string') or not policy.allows_origin(socket.headers.get('origin'))
            or len(connections.active) >= MAX_ROOMS * MAX_PARTICIPANTS + 100
            or not policy.allows_attempt(ip)):
        await socket.close()
        return

    connection = WebSocketConnection(socket)
    connections.active.add(connection)
    
    membership: Membership | None = None
    tasks: list[asyncio.Task] = []

    async def read() -> None:
        nonlocal membership
        window_start, messages = time.monotonic(), 0
        while True:
            try:
                incoming = await asyncio.wait_for(socket.receive(), JOIN_TIMEOUT) if membership is None else await socket.receive()
            except asyncio.TimeoutError:
                raise ProtocolError('Join required') from None
            if incoming['type'] == 'websocket.disconnect':
                return
            if incoming.get('bytes') is not None:
                raise ProtocolError('Text signaling required')
            text = incoming.get('text', '')
            if len(text.encode('utf-8')) > MAX_PAYLOAD:
                connection.close('Message too large', 1009)
                return
            if time.monotonic() - window_start > 10:
                messages, window_start = 0, time.monotonic()
            messages += 1
            if messages > 100:
                raise ProtocolError('Rate limit')
            message = parse_message(text)
            if membership is None:
                admission = parse_admission(message)
                membership = signaling.join(admission.room, admission.token, connection)
            else:
                signaling.handle(membership, parse_member_message(message))

    async def receive_messages() -> None:
        try:
            await read()
        except (ProtocolError, RoomError) as error:
            connection.close(str(error))
        except (ValueError, RecursionError):
            connection.close('Invalid message')
        if connection.close_reason is not None:
            # Let the writer send the close frame before the receiver completes.
            await writer

    try:
        await socket.accept()
        writer = asyncio.create_task(connection.write())
        reader = asyncio.create_task(receive_messages())
        tasks = [reader, writer]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except (WebSocketDisconnect, OSError, RuntimeError, asyncio.TimeoutError):
        pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if membership:
            signaling.leave(membership)
        connections.active.discard(connection)
