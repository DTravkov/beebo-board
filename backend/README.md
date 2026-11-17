# Backend architecture

The server is a feature-first FastAPI application under `backend/src/`. Each feature owns its routes, schemas, business logic, and storage adapter where needed. The HTTP API and WebSocket protocol remain compatible with the browser client. Room and connection state is ephemeral; board contents stay in browsers and travel over encrypted WebRTC data channels.

## Layout

```text
backend/
  requirements.in              Pinned direct dependencies
  requirements.txt             Universal dependency lock with hashes
  src/
    main.py                    Module-level FastAPI app, dependencies, lifespan, routers, frontend
    config.py                  Global Pydantic BaseSettings and TURN secret-file loading
    rooms/
      router.py                POST /api/rooms
      schemas.py               Pydantic creation and response models
      models.py                Room aggregate, admission, membership (in-memory domain models)
      service.py               Creation, verification, admission, departure, expiry
      repository.py            Per-app in-memory room storage
      dependencies.py          Service dependencies, pre-body admission, bounded command parsing
      exceptions.py            Domain errors and their HTTP status mapping
      constants.py             Room/member capacity and empty-room retention
    signaling/
      router.py                WebSocket admission, receive loop, quotas, deadlines
      schemas.py               Pydantic protocol models and untrusted JSON parsing
      service.py               Membership orchestration and same-room message routing
      repository.py            Connection protocol and in-memory connection registry
      dependencies.py          Room/repository/TURN sub-dependencies for signaling
      connection.py            Single socket writer and bounded outgoing queue
      turn_credentials.py      One-hour HMAC TURN credentials
      exceptions.py            Protocol errors
    system/
      router.py                Health and safe public configuration
      schemas.py               Public response models
    shared/
      dependencies.py          Settings and shared request-policy dependencies
      middleware.py            Global security headers
      policy.py                Exact origin allowlist and shared bounded IP quota
  tests/
    helpers.py                 Real Uvicorn HTTP/WebSocket test harness
    rooms/                     Domain capacity, expiry, and late-departure behavior
    signaling/                 Real socket protocol and queue failure cases
    system/                    HTTP, validation, headers, instance isolation, frontend files
    shared/                    Settings, quotas, TURN signatures, dependency overrides and lifetimes
```

No database is configured: rooms and connections intentionally live in memory. `models.py` contains domain dataclasses. Add `database.py` and SQLAlchemy only if a future feature needs persistence. Authentication is shared-invitation admission within `rooms`; there are no account or order features. Built frontend hosting uses FastAPI's native `app.frontend()` in `main.py`.

## Boundaries and lifecycle

Routers declare typed `Annotated[..., Depends(...)]` dependencies. Each feature's `dependencies.py` builds its service from sub-dependencies: room storage and settings feed `get_rooms`; rooms, connection storage, and TURN credentials feed `get_signaling`. The system router receives settings. Services receive explicit constructor arguments and never import FastAPI or raw sockets. The connection protocol exposes only `send` and `close`.

`main.py` exposes `app = FastAPI(...)`, registers its middleware, exception handlers and feature routers, and serves `client_dist` (default `dist/`) with `app.frontend('/', directory=settings.client_dist, fallback=None)`. FastAPI handles directory indexes, asset responses, MIME types, HEAD requests, and path confinement through its built-in static-file support. API routes take priority, and explicit 404 routes reserve `/api/` and `/signal` paths. Missing frontend paths return 404, including HTML navigation requests; this app uses invitation fragments rather than client-side path routing. Global security-header middleware also applies to frontend responses.

Settings and the frontend directory are configured when the application module is imported. If the directory does not exist, frontend hosting is omitted and the API still starts for Vite development and backend-only tests. Build before production startup; restart the backend if the directory is created after startup. The contents of the configured directory are public build output.

The application module initializes settings, room storage, connection storage, and the shared IP policy once per server process and binds their providers through FastAPI's `app.dependency_overrides`. FastAPI resolves and caches the remaining dependencies per HTTP request or WebSocket connection. This keeps persistent membership in shared repositories while service objects follow the request/connection lifetime.

Tests can replace a service, repository, settings, or policy through the same native override mechanism. For example, `app.dependency_overrides[get_rooms] = override_rooms` supplies that service both to the HTTP room route and to signaling's room sub-dependency. Providers stay async so the event-loop-owned resources are resolved without thread-pool work.

Room creation and membership operations are synchronous and run on the ASGI event loop, so capacity checks and admission cannot interleave across awaits. Networking is asynchronous. Each socket has one writer, a queue capped at 128 messages and 262,144 bytes (including its current send), and a five-second send deadline. Slow connections close without blocking other members. Incoming signaling is text-only, capped at 32,768 bytes and 100 messages per ten seconds; the initial join has a five-second deadline.

The lifespan starts a 30-second cleanup task that expires rooms, closes their sockets, and prunes IP quota entries. Background work uses explicit constructor injection with the same app-owned repositories and policy, since it runs outside request dependency resolution. The connection repository tracks active sockets, including clients awaiting admission. Shutdown cancels cleanup and closes active sockets. Uvicorn also closes admitted and unadmitted sockets before application shutdown; the launcher caps graceful shutdown at five seconds. The `websockets` Uvicorn backend is selected explicitly to retain its hard 16-message incoming queue bound. That backend is deprecated upstream; changing it requires reviewing the replacement's buffering behavior.

The room-command dependency first resolves its origin/quota admission dependency, then reads at most 4,096 bytes (including chunked requests) within ten seconds and validates them through Pydantic. Reading the body inside this dependency preserves admission-before-parsing order; FastAPI's automatic body parsing would run before dependencies. The route explicitly supplies the JSON request schema as OpenAPI metadata. Validation returns `400 { error: 'Invalid room request.' }` without echoing admission material. Middleware adds global security headers to normal responses and handled errors. There is no permissive CORS middleware or implicit proxy trust.

The framework's optional telemetry is explicitly disabled, including environment-based auto-configuration. No telemetry SDK or exporter is installed. Access logs and external documentation UI assets are disabled. Settings hide secrets in representations, and startup reports invalid configuration without printing secret-bearing validation input.

## Follow a room end to end

1. `frontend/src/lib/room.ts` generates a room ID and invitation secret in the browser. It sends only `{ roomId, verifier, policy }` to `POST /api/rooms`; encryption keys stay in the browser.
2. `rooms/router.py` validates the command through Pydantic and calls `RoomService.create()`. The service enforces TURN/direct policy, room capacity, and uniqueness before returning `201 { roomId }`.
3. The browser opens `/signal` with an allowed Origin and sends `{ type: 'join', room, token }`. `signaling/router.py` checks upgrade policy and validates admission.
4. `SignalingService.join()` verifies the token against the stored SHA-256 verifier with a constant-time comparison, registers membership, sends `ready`, and announces the member. `ready` keeps the existing camelCase fields, millisecond expiry, peers, policy, and temporary TURN credentials.
5. Offers, answers, and ICE candidates are forwarded only within the same room. The sender is derived from authenticated membership. Unknown recipients, self-directed messages, and recipients in other rooms receive no signaling.
6. Board updates and presence pass through the browser data channels. The FastAPI server never receives a board replica or invitation encryption key. A room's policy never silently falls back from relay to direct.

## Running and verification

Install Python 3.10+ and the locked requirements as described in [README.md](../README.md). Start the ASGI app directly with `python -m uvicorn backend.src.main:app --host 127.0.0.1 --port 3001`. Use the bounded WebSocket and proxy settings shown in the README or `backend/Dockerfile` for deployment. Vite runs separately with `npm --prefix frontend run dev`. Pydantic loads `.env`; process environment variables take precedence.

Run one worker and one application instance. Multiple workers or replicas would split in-memory rooms, quotas, and connections. Proxy-header trust stays disabled, so deployments behind Caddy share the quota on Caddy's observed IP. The runtime Docker image contains Python and the built client; the development image supplies both Node and Python.

`npm --prefix frontend run check` runs TypeScript checking, client unit tests, Python feature tests, and the client build. `npm --prefix frontend run test:server` runs only Python tests. Test helpers execute the ordinary application module in isolated namespaces with test environment settings; each test server receives fresh storage and dependency overrides. The server tests use stdlib unittest/HTTP and real Uvicorn/WebSocket connections. `npm --prefix frontend run test:browser` launches the production Python process, which loads `backend.src.main:app`, and exercises editing, files, privacy defaults, two-peer synchronization, an eight-peer mesh, and canvas gestures with an installed Chromium browser.

Local direct-mode tests do not establish live TURN operation. Public deployment still needs the separate relay test in [DEPLOYMENT.md](DEPLOYMENT.md).

## Framework references

The implementation uses FastAPI's [frontend hosting](https://fastapi.tiangolo.com/tutorial/frontend/), [sub-dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/sub-dependencies/), [dependency overrides](https://fastapi.tiangolo.com/advanced/testing-dependencies/), [WebSocket endpoints](https://fastapi.tiangolo.com/advanced/websockets/), [lifespan API](https://fastapi.tiangolo.com/advanced/events/), [Pydantic settings](https://fastapi.tiangolo.com/advanced/settings/), and Uvicorn's [resource-limit settings](https://uvicorn.dev/settings/).
