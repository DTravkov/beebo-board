import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from .config import Settings
from .rooms.exceptions import RoomError
from .rooms.repository import InMemoryRoomRepository
from .rooms.router import router as rooms_router
from .rooms.service import RoomService
from .shared.dependencies import get_request_policy, get_settings
from .shared.middleware import SecurityHeadersMiddleware, SECURITY_HEADERS
from .shared.policy import RequestPolicy
from .signaling.repository import InMemoryConnectionRepository
from .signaling.router import router as signaling_router
from .signaling.service import SignalingService
from .signaling.turn_credentials import TurnCredentials
from .system.router import router as system_router

CLEANUP_INTERVAL = 30

settings = Settings()

room_repository = InMemoryRoomRepository()

connection_repository = InMemoryConnectionRepository()

policy = RequestPolicy(settings.origins)

maintenance = SignalingService(
    RoomService(room_repository, settings), connection_repository,
    TurnCredentials(settings).issue,
)


async def cleanup() -> None:
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        maintenance.expire_rooms()
        policy.prune()


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cleanup())
    try:
        yield
    finally:
        task.cancel()
        for connection in list(connection_repository.active):
            connection.close('Server shutting down', 1001)
        await asyncio.gather(task, return_exceptions=True)


# No documentation UI: it would introduce external scripts into the client.
app = FastAPI(
    lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None,
    redirect_slashes=False,
    telemetry={
        'tracing': False, 'metrics': False, 'logs': False,
        'operation_spans': False, 'auto_configure': False,
    },
)


async def configured_settings() -> Settings:
    return settings


async def shared_room_repository() -> InMemoryRoomRepository:
    return room_repository


async def shared_connection_repository() -> InMemoryConnectionRepository:
    return connection_repository


async def shared_request_policy() -> RequestPolicy:
    return policy


# Bind only app-lifetime resources. FastAPI resolves service sub-dependencies
# and caches them for each HTTP request or WebSocket connection.
app.dependency_overrides.update({
    get_settings: configured_settings,
    InMemoryRoomRepository: shared_room_repository,
    InMemoryConnectionRepository: shared_connection_repository,
    get_request_policy: shared_request_policy,
})
app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(RoomError)
async def room_error(_request: Request, error: RoomError):
    return JSONResponse({'error': str(error)}, error.status_code)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, _error: RequestValidationError):
    # Never echo request values (admission material) in validation errors.
    return JSONResponse({'error': 'Invalid room request.'}, 400)


@app.exception_handler(RecursionError)
async def excessive_nesting(_request: Request, _error: RecursionError):
    return JSONResponse({'error': 'Invalid room request.'}, 400)


@app.exception_handler(Exception)
async def unexpected_error(_request: Request, _error: Exception):
    return JSONResponse({'error': 'Internal server error.'}, 500, headers=SECURITY_HEADERS)


@app.exception_handler(HTTPException)
async def http_error(request: Request | WebSocket, error: HTTPException):
    if isinstance(request, WebSocket):
        await request.close()
        return None
    if request.url.path == '/api/rooms' and error.status_code == 400:
        return JSONResponse({'error': 'Invalid room request.'}, 400)
    return JSONResponse({'error': 'Not found.' if error.status_code == 404 else error.detail}, error.status_code)

app.include_router(system_router)
app.include_router(rooms_router)
app.include_router(signaling_router)


@app.api_route('/api/{path:path}', methods=['GET', 'HEAD'], include_in_schema=False)
@app.api_route('/signal{path:path}', methods=['GET', 'HEAD'], include_in_schema=False)
async def missing_backend_route(path: str):
    raise HTTPException(404)


@app.websocket('/{path:path}')
async def reject_socket(socket: WebSocket, path: str):
    await socket.close()


# Vite serves the frontend during development, before dist exists.
if settings.client_dist.is_dir():
    app.frontend('/', directory=settings.client_dist, fallback=None)
