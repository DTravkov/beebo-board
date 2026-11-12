# Development workflow rules

These rules apply to human and AI contributors throughout this repository.

## Required workflow

1. **All initialization work and all subsequent changes must enter `main` through a Pull Request. Never commit or push directly to `main`.**
2. **Create a distinct new branch for every feature or bug fix:** `feature/short-description` or `fix/short-description`. Documentation/tooling changes use a fresh `feature/` branch. Never reuse a branch for unrelated work.
3. Inspect the working tree before editing. Preserve unrelated user changes. Do not merge your own work or rewrite shared history without explicit authorization.
4. Keep changes concrete and reviewable. State implementation limits honestly. Do not claim DPG recognition, comprehensive license certification, or accessibility conformance without evidence.

## License and provenance

- Project contributions use Apache-2.0. Preserve third-party license and copyright notices.
- Introduce only dependencies covered by [docs/LICENSE_POLICY.md](docs/LICENSE_POLICY.md). No copyleft-only components, including GPL/AGPL/LGPL/MPL, or proprietary/unknown licenses.
- Audit direct, transitive, development, optional, platform-specific, and bundled dependencies. A top-level MIT badge is insufficient.
- Pin direct versions. Update `package-lock.json`, `sbom.cdx.json`, `THIRD_PARTY_NOTICES.txt`, and `docs/license-audit.json` together after review.
- Run `npm run licenses:check`. Never bypass a failure or broaden an allowlist without documented source evidence.
- Treat generated code and copied assets like other contributions: verify provenance and license suitability.

## Architecture and hygiene

- Keep the versioned board schema independent of rendering and transport.
- Shared document properties belong in Yjs. UI selections, viewport, and tools stay local; cursor presence is ephemeral.
- Treat every peer and imported file as untrusted. Validate data and bound object counts, payloads, assembly buffers, queues, and connection attempts.
- Preserve TURN-only defaults. Never silently fall back to direct networking or unencrypted application relays.
- Keep room encryption keys out of server requests, logs, and persisted personal preferences.
- Do not commit secrets, personal learner data, real invitations, or private board content.
- Keep personal saving opt-in and shared-room storage explicit. Do not introduce analytics or external assets casually.
- Use strict TypeScript, clear names, two spaces, semicolons, and single quotes. Avoid unrelated refactors.
- Preserve keyboard access, dialog focus handling, visible focus, and the semantic object editor.

## Checks and handoff

- Run `npm run check` for substantive changes. Run the browser smoke tests for transport or interaction changes when a compatible local browser is available.
- Test the behavior that can fail: convergence, authorization, import validation, reconnects, and slow/malicious peers. Do not add tests that merely repeat low-impact implementation details.
- Update affected documentation and architecture decisions.
- In the handoff, explain what changed, actual checks run, and material limitations. A local direct-connection test does not establish live TURN operation.
- Cloud publication, repository protection, formal DPG recognition, and moderation readiness are separate from local implementation; do not imply they have been configured.
