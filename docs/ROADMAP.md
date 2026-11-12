# Implementation roadmap

This is the first implementation slice of the master plan. Checked items describe repository work, not deployment certification.

## Implemented for review

- [x] Apache-2.0 foundation, contributor/agent rules, PR template, and CI configuration.
- [x] Pinned npm dependency tree, automated license gate, CycloneDX inventory, and full available third-party notices.
- [x] Canvas tools, text/sticky notes, local undo/redo, pan/zoom, title editing, and portable JSON/PNG exports.
- [x] Explicit personal-board IndexedDB save/restore/delete.
- [x] Native WebRTC mesh, authenticated signaling, eight-person admission limit, temporary TURN credentials, and relay-only defaults.
- [x] HKDF-separated room keys and AES-GCM payload encryption; bounded chunking, validation, and queues.
- [x] Yjs synchronization, joining from state vectors, local undo isolation, and ephemeral cursors.
- [x] Two education activity templates, low-bandwidth settings, and semantic object editing.
- [x] Unit/integration checks and production-browser smoke coverage.

## Required before a public classroom release

1. Manually review the current product and validate an actual TURN deployment, including restricted networks, TLS relay, eight-person traffic, and credential expiry.
2. Conduct educator and accessibility trials: keyboard-only use, screen readers, contrast, low-end touch devices, mobile pen input, and WCAG 2.2 AA gaps. Add localization infrastructure and prioritized languages.
3. Benchmark latency, bandwidth, CPU/memory, initial bundle transfer, reconnects, and CRDT history growth. Define measured support limits.
4. Design and implement enforceable teacher/student roles, participant removal, room-secret rotation, and clearly described retention/export expectations. UI-only permission controls are insufficient.
5. Harden signaling: bounded unauthenticated sockets, distributed/edge limits where needed, trusted-proxy configuration, live connection recovery, credential refresh, and adversarial decoding tests.
6. Establish monitored private security/conduct channels, incident response, operator abuse procedures, deployment notices, and applicable-law assessment.
7. Audit complete release artifacts and deployment infrastructure, enable repository protections, and confirm ownership/governance.
8. Assemble DPG evidence, assess readiness against the current standard, then consider nomination.

## Later extensions

- Character-level collaborative text and richer educational objects.
- Encrypted WebSocket data fallback for networks that cannot establish WebRTC; no plaintext downgrade.
- Offline application-shell caching and deliberate durable room storage with encryption/retention design.
- Classroom-sized topology following measured limits; do not simply raise the eight-person cap.
- Public lesson/template sharing with separate content licensing and moderation design.
- Format migrations, release compatibility testing, and optional integrations that preserve self-hosting.
