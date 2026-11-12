# Architecture and protocol, version 1

## Decisions

The first release targets trusted groups of up to eight people. React renders application controls; Konva renders the canvas. Yjs stores board content in the browser. Native WebRTC data channels carry browser-encrypted payloads. Fastify and `ws` provide room admission and signaling. coturn is an external operator-managed relay.

The default policy is `iceTransportPolicy: 'relay'`. Room creation fails if TURN is not configured. Direct mode requires `DIRECT_CONNECTIONS_ENABLED=true` and an explicit selection by the creator. A room's policy is immutable; the server returns it to each admitted member. Joining users are told that the creator chooses the connection policy. No public STUN servers or public signaling services are built in.

## Source layout

```text
src/App.tsx                 Workspace and local product flows
src/components/Canvas.tsx   Konva interaction and rendering
src/components/Dialog.tsx   Native modal focus containment
src/shared/board.ts         Portable schema, validation, and limits
src/lib/document.ts         Yjs document and local undo
src/lib/crypto.ts           Invitation key derivation and payload encryption
src/lib/room.ts             Signaling client, peer mesh, and wire protocol
src/lib/storage.ts          Explicit personal-board IndexedDB saving
server/app.ts               Admission, quotas, membership, and static serving
server/index.ts             Environment configuration and lifecycle
scripts/                    Development, packaging, and license checks
tests/                      Behavioral unit, signaling, and browser tests
```

## Shared state

Each `BoardDocument` owns a Yjs document with three roots:

| Root       | Representation          | Purpose                                            |
| ---------- | ----------------------- | -------------------------------------------------- |
| `objects`  | `Y.Map<Y.Map<unknown>>` | Shape IDs map to independently editable properties |
| `order`    | `Y.Array<string>`       | Stacking order                                     |
| `metadata` | `Y.Map<string>`         | Board title                                        |

Local selections, tool settings, viewport, and dialog state are never synchronized. Remote cursors are short-lived presence frames. Remote transaction origins are excluded from local undo and rebroadcast. Undo tracks this browser's edits and should preserve independent remote property edits.

Concurrent writes to the same scalar property resolve through Yjs's deterministic conflict rules. Text fields are currently whole-string properties: simultaneous edits to the same note do not merge character-by-character. Repositioning an object and editing its text are independent. Concurrent deletion/replacement and reordering need further interaction testing before complex classroom editing is promised.

A joining client starts with an empty document. On channel opening, both sides send state vectors and exchange missing updates. There is no persistent server replica. Reloading requires an explicit join and at least one connected peer holding the board. If all replicas disappear, exports are the recovery mechanism.

## Invitation and admission

1. The creator generates a random room UUID and a cryptographically random 32-byte invitation secret in the browser.
2. HKDF-SHA-256 uses the room ID as salt and distinct information strings to derive an AES-256-GCM key and a 32-byte admission token.
3. The creator sends the room ID, connection policy, and SHA-256 hash of the admission token to `POST /api/rooms`.
4. The invitation stores `room` and `key` in the URL fragment, which is not sent in normal HTTP requests. It is not put in a query string or server logs.
5. A WebSocket must send an admission message within five seconds. The server hashes its token and uses a timing-safe comparison against the stored verifier.
6. Successful admission returns peer IDs, room policy/expiry, and temporary TURN credentials. Subsequent signaling is routed only to members of that room.

The server can observe or interfere with membership and signaling. It does not know the secret needed to decrypt or forge application payloads. This is group-secret authentication, not individual identities: any invitation holder has the same document privileges. Room secrets can leak through clipboard sharing, browser history, extensions, screenshots, or invited users.

## Data channel protocol

Each pair has one ordered, reliable data channel labeled `beebo-v1`. Complete strokes are committed on pointer release; pen previews are local. Local document transactions produce incremental Yjs updates. Reliable transport currently also carries presence, which is throttled and skipped while a peer is backlogged.

Messages are split into 12,000-byte plaintext chunks. Each plaintext chunk has a 14-byte header:

| Bytes     | Meaning                                                  |
| --------- | -------------------------------------------------------- |
| 0         | Protocol version, currently 1                            |
| 1         | Kind: 0 state vector, 1 document update, 2 presence JSON |
| 2–9       | Random 8-byte message identifier                         |
| 10–11     | Big-endian chunk index                                   |
| 12–13     | Big-endian total chunk count                             |
| 14 onward | Chunk payload                                            |

Every chunk gets a fresh random 96-bit nonce and AES-GCM encryption. The transmitted bytes are nonce followed by ciphertext and authentication tag. The room ID is authenticated as additional data. Replay tracking is bounded and session-local; this is not a forward-secure group messaging protocol.

Outgoing encryption and sends, incoming decryption/application, and signaling handling are serialized to avoid races. Channel backpressure pauses sending; a slow peer is disconnected after a bounded wait. Inbound updates are applied to an isolated candidate replica and validated before reaching the live document. This adds copying overhead and does not eliminate all CRDT denial-of-service risks.

## Current bounds

| Resource                                           | Limit                                                  |
| -------------------------------------------------- | ------------------------------------------------------ |
| Participants                                       | 8 per room                                             |
| In-memory rooms                                    | 250 per process                                        |
| Signaling sockets                                  | 2,100 per process; admission required within 5 seconds |
| Objects                                            | 1,000 per board                                        |
| Stroke points                                      | 8,000 numeric values / 4,000 points                    |
| Text                                               | 2,000 characters per object                            |
| Import / message / accepted encoded shared history | 2,000,000 bytes                                        |
| Per-peer queued send/receive payload               | 4,000,000 bytes each                                   |
| Incomplete messages                                | 4 per peer; cleaned after 10 seconds                   |
| Signaling payload                                  | 32,768 bytes                                           |
| HTTP body                                          | 4,096 bytes                                            |
| HTTP room requests + socket upgrades               | 60 per minute per observed IP                          |
| WebSocket signaling                                | 100 messages per 10 seconds per connection             |
| Room lifetime                                      | 2 hours; empty rooms cleaned after 10 minutes          |
| TURN credentials                                   | 1 hour from admission                                  |

Limits are defensive starting values, not measured capacity claims. TURN credentials are not refreshed automatically; long sessions may require a new admission for fresh allocations. The cleanup loop runs every 30 seconds. A closed or failed peer must rejoin; automatic negotiation recovery is not implemented. Export and start a fresh room when shared history reaches its limit.

## Persistence and portability

The `.beebo.json` format includes `format: 'beebo-board'`, `version: 1`, title, and ordered shapes. It excludes encryption material, presence, and CRDT internals. Imports validate schema/version, bounded values, and duplicate IDs before replacing board content. A replacement can be undone locally.

IndexedDB stores one explicitly enabled personal board under a local-only key. It is never automatically restored or used for shared rooms. PNG exports show the current viewport and are not editable backups. A service worker, offline application-shell cache, durable room storage, and cloud accounts are outside this implementation.

## Scaling and next decisions

An eight-person mesh has 28 connections and seven outgoing recipients per author. TURN preserves that topology and incurs relay bandwidth cost. There are no video/audio streams. Classroom-sized sessions need measured bandwidth results, a topology decision, enforceable roles, and a separate encryption/key lifecycle design.

Sources: [WebRTC](https://www.w3.org/TR/webrtc/), [Yjs](https://github.com/yjs/yjs), [Web Crypto](https://www.w3.org/TR/WebCryptoAPI/).
