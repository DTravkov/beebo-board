# Deployment

`docker-compose.yml` runs production; `docker-compose.dev.yml` is a standalone development stack. Both use `.env` for interpolation. Use Linux containers and Compose 2.23.1+.

## Local development

```sh
docker compose -f docker-compose.dev.yml up --build
```

Open http://localhost:5173. Vite and Uvicorn run in separate containers. Source directories are mounted read-only; dependencies stay in cached image layers. Rebuild after lockfile or package changes. Normal restarts install nothing. Stop with `docker compose -f docker-compose.dev.yml down`.

Vite polls every 500 ms on Windows mounts and ignores Python environments and caches. Set `DEV_POLLING=false` when native events work. Backend reload checks `backend/src` once per second. The dev stack enables the direct option; select it explicitly in Share. The room default remains TURN-only. `PUBLIC_ORIGIN` in `.env` must include the exact browser origin, including scheme and port.

## Public hosting

One Linux host with a public IPv4 address runs three services:

| Service    | Purpose                                       | Public ports                    |
| ---------- | --------------------------------------------- | ------------------------------- |
| `backend`  | API and WebSocket signaling                   | None; Caddy connects internally |
| `frontend` | Built frontend, HTTPS and certificate renewal | TCP 80, 443                     |
| `turn`     | Authenticated coturn relay                    | TCP/UDP 3478, UDP 49160-49260   |

1. Point `board.your-domain.org` and `relay.your-domain.org` DNS A records to the host. The relay record must resolve directly to it, without an HTTP proxy. Open the listed firewall ports; if behind NAT, forward them without changing relay ports.
2. Copy `.env.example` to `.env` and set these four values:

   ```dotenv
   APP_DOMAIN=board.your-domain.org
   TURN_DOMAIN=relay.your-domain.org
   TURN_PUBLIC_IP=your-public-ipv4
   TURN_SECRET=your-random-secret
   ```

   Generate the secret with `node -p "require('crypto').randomBytes(32).toString('hex')"`. Keep `.env` private and uncommitted. Production Compose sets origins and TURN URLs from these values and keeps direct connections disabled; the local npm settings in `.env` do not override that policy.

3. Start the stack:

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

4. Open `https://board.your-domain.org`. Caddy obtains certificates automatically when DNS and ports are reachable. Create a room and share the complete invitation, including its fragment. Independent groups use separate rooms on the same deployment, with up to eight participants per room.

The Compose file passes the same TURN secret to FastAPI and coturn. FastAPI issues temporary credentials after room admission; browsers never receive the long-term secret. Missing relay settings stop coturn at startup. Docker administrators can inspect container configuration and secrets; avoid sharing expanded `docker compose config` output.

Caddy certificate state survives container restarts in named volumes. Restarting FastAPI loses in-memory rooms and invalidates their admission; participants need a new invitation. Rebuild after pulling changes with the same `up -d --build` command. Stop with `docker compose down`.

## Test across machines

Use two machines on different networks, such as home Wi-Fi and a mobile hotspot. Open the HTTPS URL on both, create a default relay room, and join using its invitation. Verify that strokes, notes, movement, cursors, and exports agree. Create another room and confirm its objects remain separate.

Inspect the connection in Chromium's `chrome://webrtc-internals` or Firefox's `about:webrtc`: the selected candidate pair must use relay candidates in default mode. Confirm there are no WebSocket, certificate, or ICE errors. This live test establishes TURN operation; local direct-mode tests do not.

The supplied relay offers TURN over UDP and TCP on 3478, with UDP relay allocations. It does **not** configure TURN/TLS on 5349 or 443. Networks blocking these transports need an additional TLS relay configuration and certificates. Browser-to-browser data remains encrypted, but arbitrary restrictive networks are not guaranteed to work.

## Without Docker

Use npm for the frontend and a Python virtual environment with pip for the backend; see the direct Vite and Uvicorn commands in [README.md](../README.md). Run `npm --prefix frontend run build` for static assets. Production Caddy serves `dist` and proxies `/api` and `/signal` to Uvicorn; `frontend/Caddyfile` is the supplied configuration. `npm --prefix frontend start` is a development preview, not the production server.

Run exactly one backend worker and one backend instance: rooms, quotas, and connections are in memory. Proxy-header trust remains disabled. The two-stage `backend/Dockerfile` installs locked requirements in a virtual environment and copies it into a non-root Python runtime. `frontend/Dockerfile` builds with Node and copies only static output into Caddy. Node is absent from both production runtimes. Live TURN verification still requires two networks.

See [SECURITY.md](../SECURITY.md) for retention, permissions, and hosting limits. Standard infrastructure images are allowed under their own licenses; Beebo's application dependency policy is in [CONTRIBUTING.md](../CONTRIBUTING.md).
