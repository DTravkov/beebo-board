# Security and privacy

Beebo is an early implementation without an independent security assessment.

## Reporting

Use GitHub private vulnerability reporting or a private security advisory if enabled. Do not post invitations, learner data, tokens, or exploitable details in public issues. Include the affected version, reproduction steps using synthetic data, and expected impact.

The maintainer must enable private reporting or publish a monitored private contact before a supported public service. No verified private contact or response-time commitment is currently documented.

## Data and retention

- Board content lives in participant browser memory and travels encrypted over WebRTC. The server has no persistent board replica. Participants can retain copies.
- Automatic local saving is opt-in for personal boards and disabled in shared rooms. Save board explicitly stores a snapshot of either kind in this browser's IndexedDB. Restore and deletion are explicit in My workspace. Local snapshots and JSON/PNG exports are plaintext.
- Invitations carry the room secret in the URL fragment. It is not sent in normal HTTP requests, but can remain in history, clipboard contents, messages, or recipients' copies.
- Room admission verifiers, membership, and signaling are held in server memory until expiry or restart. Application request logging is disabled. Hosting and TURN operators can see IP addresses and traffic metadata; their log retention is deployment-specific.
- Display names and cursors are ephemeral encrypted presence. There are no accounts, analytics, third-party fonts, camera, microphone, or geolocation requests.

## Limits

All invitation holders can edit and copy the board. There are no teacher permissions, participant revocation, or group key rotation. Encryption does not protect against invited malicious editors, compromised devices, or a host serving modified JavaScript.

TURN-only mode prevents direct peer connections; the infrastructure still sees endpoint IP addresses. Explicit direct mode can reveal those addresses to participants. Input limits reduce denial-of-service exposure without eliminating it.

Rooms expire after two hours. TURN credentials last one hour and are not refreshed automatically. Rejoining is required after failed connections; automatic recovery and multi-instance signaling are not implemented. Exports or explicitly saved snapshots are needed when no peer retains the board.

## Operator responsibilities

Provide HTTPS, authenticated TURN, restricted origins, firewall rules, quotas, and deliberate log retention. Keep host images and npm dependencies updated; use `npm audit` to review advisories. The app groups clients behind a reverse proxy under its observed IP quota, so capacity and edge rate limits need review before broader hosting.

Before classroom use, assess learner privacy, accessibility, consent requirements, incident reporting, and moderation. Publish deployment-specific privacy and contact information. The project does not establish legal compliance or child-safety certification.
