# Beebo Board

A privacy-first collaborative whiteboard for tutoring and small groups of up to **eight people**. Built with React, Konva, Yjs, native WebRTC, and a Node.js signaling server.

Draw, write notes, add images and frames, move and resize objects, and export JSON or PNG. Boards stay in browser memory unless you explicitly save or export them. The header provides local saving and export; saved boards can be restored or deleted in My workspace.

Collaboration uses encrypted WebRTC data channels. TURN-only networking is the default; direct connections require operator enablement and an explicit choice when creating a room. No accounts, analytics, or external asset services are required.

## Run locally

Use Node.js 22.12+ and npm.

```sh
npm ci
# Copy .env.example to .env and configure it if collaboration is needed.
npm run dev
```

Open **http://localhost:5173**. To test rooms without TURN, set `DIRECT_CONNECTIONS_ENABLED=true` in `.env`, restart, and select direct connections in Share board. This can expose participants' IP addresses to one another.

For a local production build, run `npm run build` then `npm start` and open **http://localhost:3001**.

## Docker

One Compose file provides two profiles (Docker Compose 2.23.1+):

```sh
# Local development with hot reload; choose direct mode to test rooms.
docker compose --profile dev up

# Public hosting: configure .env first.
docker compose --profile production up -d --build
```

Production runs the app, Caddy for HTTPS, and coturn on one host. It requires two DNS names, a public IPv4 address, a TURN secret, and open firewall ports. See [deployment](docs/DEPLOYMENT.md) for the exact settings and connection test.

## Development

```sh
npm run check          # TypeScript, unit/server tests, production build
npm run test:browser   # Browser smoke tests; build first, requires installed Edge
```

Set `BROWSER_EXECUTABLE` to use another installed Chromium browser. All changes use a fresh branch and a human-reviewed PR; see [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## Education, privacy, and licensing

Beebo supports **SDG 4: Quality Education** through free small-group collaboration, activity templates, keyboard editing, a semantic Objects panel, and a low-bandwidth option. Its open formats and privacy controls support the Digital Public Goods standard's aims; it has **not received DPG recognition** or an independent accessibility or security assessment.

This is an early implementation. Invitation holders can edit and copy all room content. There are no teacher roles or participant revocation, and rooms have no server-side board storage. Read [security and privacy limits](SECURITY.md) before hosting for learners.

Beebo is [Apache-2.0](LICENSE). Application dependencies must be permissively licensed; retain [third-party notices](THIRD_PARTY_NOTICES.txt). Standard Node, Caddy, and coturn infrastructure images are allowed and retain their own component licenses.

[Architecture](docs/ARCHITECTURE.md) describes the document, encryption, and transport boundaries.
