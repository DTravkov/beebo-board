# Deployment

The root `docker-compose.yml` has two profiles. Both use the same `.env`; there is no setup generator or image-approval file. Use Docker with Linux containers and Compose **2.23.1+**, which supports the inline Caddy and coturn configurations.

## Local development

```sh
docker compose --profile dev up
```

Open **http://localhost:5173**. The `dev` service installs the locked dependencies, starts Vite and the signaling server with file watching, and mounts the source for editing. A separate Docker volume holds Linux `node_modules`; it does not overwrite host dependencies. Stop with Ctrl+C or `docker compose --profile dev down`.

This profile binds ports 5173 and 3001 to localhost and enables the direct-connection option. Choose **Allow direct connections** in Share board to test a room between tabs or browsers on this machine. TURN-only remains the default room policy; there is no silent fallback. Direct connections can reveal peers' IP addresses.

## Public hosting

One Linux host with a public IPv4 address runs three services:

| Service | Purpose                                | Public ports                    |
| ------- | -------------------------------------- | ------------------------------- |
| `app`   | Built client, API, WebSocket signaling | None; Caddy connects internally |
| `https` | Caddy HTTPS and certificate renewal    | TCP 80, 443                     |
| `turn`  | Authenticated coturn relay             | TCP/UDP 3478, UDP 49160-49260   |

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
   docker compose --profile production up -d --build
   docker compose --profile production ps
   ```

4. Open `https://board.your-domain.org`. Caddy obtains certificates automatically when DNS and ports are reachable. Create a room and share the complete invitation, including its fragment. Independent groups use separate rooms on the same deployment, with up to eight participants per room.

The Compose file passes the same TURN secret to Node and coturn. Node issues temporary credentials after room admission; browsers never receive the long-term secret. Missing relay settings stop coturn at startup. Docker administrators can inspect container configuration and secrets; avoid sharing expanded `docker compose config` output.

Caddy certificate state survives container restarts in named volumes. Restarting Node loses in-memory rooms and invalidates their admission; participants need a new invitation. Rebuild after pulling changes with the same `up -d --build` command. Stop with `docker compose --profile production down`.

## Test across machines

Use two machines on different networks, such as home Wi-Fi and a mobile hotspot. Open the HTTPS URL on both, create a default relay room, and join using its invitation. Verify that strokes, notes, movement, cursors, and exports agree. Create another room and confirm its objects remain separate.

Inspect the connection in Chromium's `chrome://webrtc-internals` or Firefox's `about:webrtc`: the selected candidate pair must use relay candidates in default mode. Confirm there are no WebSocket, certificate, or ICE errors. This live test establishes TURN operation; local direct-mode tests do not.

The supplied relay offers TURN over UDP and TCP on 3478, with UDP relay allocations. It does **not** configure TURN/TLS on 5349 or 443. Networks blocking these transports need an additional TLS relay configuration and certificates. Browser-to-browser data remains encrypted, but arbitrary restrictive networks are not guaranteed to work.

## Without Docker

Run `npm ci`, `npm run build`, and `npm start`. Set `HOST`, `PORT`, and the exact `PUBLIC_ORIGIN` in `.env`; forward HTTPS and WebSocket upgrades to Node with your reverse proxy. Configure an external coturn with matching `TURN_SECRET` and `TURN_URLS`, or use `TURN_SECRET_FILE` instead of `TURN_SECRET`. This requires managing the proxy, certificates, relay configuration, and process supervision yourself.

See [SECURITY.md](../SECURITY.md) for retention, permissions, and hosting limits. Standard infrastructure images are allowed under their own licenses; Beebo's application dependency policy is in [CONTRIBUTING.md](../CONTRIBUTING.md).
