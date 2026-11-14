# Compose deployment

`docker-compose.yml` defines the complete three-service application topology:

- **app:** builds the React client and Node signaling server; reachable only by the proxy.
- **https:** Caddy terminates HTTPS, manages the application certificate, and proxies HTTP/WebSocket requests to `app:3001`.
- **turn:** coturn provides authenticated TURN/UDP and TURN/TCP on 3478 with UDP relay ports 49160–49260.

One public Linux Docker host with a public IPv4 address can run all three. The shipped setup preserves relay-only defaults. No application database is needed: boards remain in participant browsers and optional local snapshots.

## Image licensing is an explicit prerequisite

The project's no-copyleft policy applies to introduced components. A top-level Node MIT, Caddy Apache-2.0, or coturn BSD license does **not** clear an entire container image. Common base images include GPL/LGPL OS packages; stock coturn images additionally install optional database/HTTP components with copyleft terms. This repository does not select or approve those images automatically.

Supply reviewed, digest-pinned images and record the human review. The preflight checks that the declared inventory is permissive and matches the selected references; it cannot certify the contents of a binary image. **No complete container-image audit or certified permissive image set is supplied.** A literal no-copyleft deployment requires separately audited/custom images, including build tools and native libraries. Do not fill the review with an upstream project's root license alone.

Image contracts:

| Variable             | Required contents/behavior                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_BUILD_IMAGE`   | Linux Node.js 22.12+, npm, and the shell required by npm scripts; approved complete toolchain/runtime inventory                        |
| `NODE_RUNTIME_IMAGE` | Matching Node.js ABI/libc/CPU architecture and runtime libraries; `node` available on PATH; runs as UID 10001                          |
| `CADDY_IMAGE`        | `caddy` on PATH, Caddyfile adapter and automatic HTTPS support; writable named volumes `/data` and `/config`                           |
| `COTURN_IMAGE`       | `/usr/bin/turnserver`; compatible configuration flags and read-only operation as UID 65532; no reliance on an image's shell entrypoint |

The Node build stage installs locked dependencies with lifecycle scripts disabled, regenerates license evidence on Linux, runs checks/build, and prunes development dependencies. It includes notices and the SBOM in the application artifact. The runtime is read-only and non-root.

## Configure and start

1. Point `APP_DOMAIN` and `TURN_DOMAIN` DNS records to the public host. Keep the host's firewall, provider firewall, and NAT mappings consistent. Avoid a DNS/CDN HTTP proxy on the TURN hostname.
2. Copy `deploy/compose.env.example` to `.env.compose`. Set the real hostnames, real public relay IP, and the four approved image references, each ending in `@sha256:<64 hex digits>`.
3. Generate a random secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and put it in `TURN_SECRET`. Keep the file private. It is deliberately separate from your development `.env`.
4. Create `.deploy/`, copy `deploy/image-review.example.json` to `.deploy/image-review.json`, and complete the reviewer/date, exact references, complete permissive-license inventories, and audit evidence locations.
5. Prepare protected secret/config files, validate Compose without printing secrets, and start:

```sh
node scripts/prepare-compose.mjs .env.compose
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose up --build -d
docker compose --env-file .env.compose ps
```

`.env.compose`, `.deploy/`, local image-review evidence, and Docker-local state are ignored by Git and excluded from build context. Never include real secrets in PRs, pasted logs, or generated public artifacts. The helper uses private parent directories and read-only bind-mounted files readable by the non-root services. On Windows, ensure the corresponding directory ACL is private as well; POSIX mode bits alone do not establish Windows ACL protection.

The application reads `TURN_SECRET_FILE`; coturn receives the identical secret through a protected configuration file. No secret is put in coturn command arguments or a shell-expanded entrypoint. Only the application hostname is passed to Caddy. Changing development `.env` does not configure this stack.

## Networking and HTTPS

Allow inbound TCP 80/443, TCP/UDP 3478, and UDP 49160–49260. App port 3001 is not published. Caddy's `/data` and `/config` volumes persist certificates and account state. The relay advertises `TURN_PUBLIC_IP`; behind NAT, publish the same relay port numbers end-to-end. A shared NAT that cannot reach its own public address can still require network-specific adjustments.

The default is **application HTTPS plus TURN/UDP and TURN/TCP**. WebRTC payloads remain encrypted over TURN. This Compose file does not advertise TURN/TLS on 5349: restrictive networks may require an additional TLS relay endpoint. For that extension, provision a valid TURN certificate/key separately, audit their mounts/permissions and renewal process, update coturn flags/ports and `TURN_URLS`, and test the actual endpoint. Caddy's application HTTPS certificate does not automatically configure coturn TLS. Do not advertise `turns:` until it works.

The app keeps per-IP request limits and does not blindly trust forwarded headers. All clients behind Caddy currently share the proxy address for those limits. This is suitable for an initial small deployment; configure edge limits and a restricted trusted-proxy policy before scaling.

## Verify and maintain

Open `https://<APP_DOMAIN>/api/health` and `https://<APP_DOMAIN>/api/config`; expect healthy status, `turnConfigured: true`, and `directEnabled: false`. Create a room and join from another network. Confirm selected ICE candidates are relay candidates, then test eight people and multiple independent groups, reconnects, and blocked UDP. A configuration check is not a live relay test.

For changed secret or configuration, rerun preparation and `docker compose --env-file .env.compose up --build -d --force-recreate`. Export active boards first; recreation interrupts rooms. `docker compose --env-file .env.compose down` stops services and preserves named volumes. Removing volumes also removes Caddy certificate state. Runtime logs are bounded but contain connection metadata: set access/retention rules for your deployment.

Current verification limits must be recorded in the PR: a Docker daemon and real public DNS/TURN host are needed to build and exercise the whole stack. Human image review is required before deployment.

References: [Compose service configuration](https://docs.docker.com/reference/compose-file/services/), [required interpolation values](https://docs.docker.com/reference/compose-file/interpolation/), [Caddy proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [coturn configuration](https://github.com/coturn/coturn/blob/master/README.turnserver), [upstream coturn container contents](https://github.com/coturn/coturn/blob/master/docker/coturn/alpine/Dockerfile), [license policy](../docs/LICENSE_POLICY.md).
