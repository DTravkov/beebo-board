# Local operation and self-hosting

## Docker Compose

The root `docker-compose.yml` defines the app, Caddy HTTPS proxy, and coturn relay. Follow [deploy/README.md](../deploy/README.md) for required DNS, protected secrets, explicit reviewed image digests, image contracts, firewall ports, and startup commands. Stock images are not automatically cleared under the project's no-copyleft policy.

The provided stack uses application HTTPS and TURN/UDP + TURN/TCP on 3478. TURN/TLS is a documented extension requiring a separate working certificate/renewal setup; it is not silently advertised. Validate configuration with `node scripts/check-compose.mjs`; this renders only synthetic inputs and does not pull images or test a live relay.

## Local review

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` and `/signal` to `127.0.0.1:3001`. Keep the signaling port at 3001 for this development proxy, or change the proxy deliberately. The combined development script loads `.env` for the signaling process.

For a local direct-mode evaluation, put `DIRECT_CONNECTIONS_ENABLED=true` in `.env`, restart, and select **Allow direct connections** in Share board. Use independent browser profiles/contexts for realistic peer tests. Direct mode is an explicit evaluation option; the default remains relay-only.

## Production process

Build with development dependencies available:

```sh
npm ci
npm run check
npm start
```

The build produces `dist/` for the static client and `dist-server/` for the Node server. `npm start` runs compiled JavaScript and loads `.env`. A runtime-only installation may use `npm ci --omit=dev --ignore-scripts` after the build. Keep `dist`, `dist-server`, package metadata/lockfile, required notices, and runtime dependencies together. Never include `.env` in a release artifact.

Example configuration:

```dotenv
HOST=127.0.0.1
PORT=3001
PUBLIC_ORIGIN=https://board.example.org
TURN_URLS=turn:relay.example.org:3478?transport=udp,turns:relay.example.org:5349?transport=tcp
TURN_SECRET=replace-with-a-long-random-operator-secret
DIRECT_CONNECTIONS_ENABLED=false
```

Set `PUBLIC_ORIGIN` to the exact origin, with no trailing slash. Comma-separated values support deliberate multiple-origin deployments. The server binds loopback by default. Terminate HTTPS at your chosen reverse proxy, forward WebSocket upgrades on `/signal`, and forward ordinary requests to Node. The static client and API are intended to share one public origin. Audit the proxy, operating-system packages, Node distribution, and runtime image independently under the license policy.

The app does not trust forwarded IP headers. Behind a proxy, its per-IP quota may group all clients under the proxy's address. Configure rate limits at the edge and review a restricted trusted-proxy design before increasing capacity; do not enable blanket proxy trust.

## TURN service

coturn is an external service; this repository does not install it or ship a container image. Audit the exact relay binary and its dependencies before deployment. Its upstream project uses BSD-3-Clause.

Configure coturn's shared-secret authentication with the same value as `TURN_SECRET`. Relevant settings include:

```ini
fingerprint
use-auth-secret
static-auth-secret=replace-with-the-same-operator-secret
realm=relay.example.org
listening-port=3478
tls-listening-port=5349
min-port=49160
max-port=49260
no-multicast-peers
# cert=/operator/path/to/fullchain.pem
# pkey=/operator/path/to/privkey.pem
```

This is a settings outline, not a complete secure coturn configuration. Supply valid TLS certificates, advertised/public IP configuration as needed, a relay port range in your firewall, per-user/global quotas, bandwidth limits, and peer-address restrictions for your network. Block relay access to internal/management networks where appropriate. Do not expose an unauthenticated relay. Test TURN/TLS on a port reachable from the intended learning environments; a separate relay endpoint on 443 can help restrictive networks, but is not guaranteed to bypass their policy.

The server issues one-hour HMAC-SHA1 TURN REST credentials after admission. The HMAC authenticates TURN credentials; board payload encryption uses AES-256-GCM. No long-term TURN secret goes to the browser. Credential refresh is not automatic yet.

Primary references: [coturn deployment documentation](https://github.com/coturn/coturn), [TURN REST authentication](https://github.com/coturn/coturn/blob/master/README.turnserver).

## Acceptance before public hosting

Run the live-relay checklist in [REVIEW.md](REVIEW.md). Measure relay traffic/cost at eight participants, test the target networks, and verify relay candidates in default mode. Configure monitoring without board contents/tokens, deliberate log retention, dependency updates, backups for operator configuration, and process supervision.

Before offering a classroom service, resolve the documented gaps around private security/conduct contacts, enforceable teacher permissions, participant removal/key rotation, applicable privacy obligations, and accessibility assessment. Hosting configuration alone does not confer DPG recognition.
