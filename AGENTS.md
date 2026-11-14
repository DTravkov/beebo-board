# Development workflow rules

These rules apply to human and AI contributors.

## Required workflow

- **All initialization work and later changes must enter `main` through a human-reviewed Pull Request. Never commit or push directly to `main`.**
- **Create a distinct branch for every feature or fix:** `feature/short-description` or `fix/short-description`. Documentation and tooling use a fresh `feature/` branch. Never reuse branches for unrelated work.
- Inspect the working tree before editing and preserve unrelated changes. Do not merge your own PR or rewrite shared history without explicit authorization.

## Licenses

- Contributions use Apache-2.0. Preserve third-party copyright and license notices.
- Application dependencies must be permissively licensed. Exclude copyleft-only, proprietary, and unknown terms. Review direct, transitive, development, optional, platform-specific, and bundled components, including copied assets and generated code.
- Pin direct versions; review `package-lock.json` and update `THIRD_PARTY_NOTICES.txt` together when dependencies change. See [CONTRIBUTING.md](CONTRIBUTING.md).
- Standard infrastructure images (Node, Caddy, coturn) are allowed under their own component licenses. No custom image-approval gate is required.

## Architecture and hygiene

- Keep the versioned board schema independent of rendering and transport. Shared content belongs in Yjs; selection, viewport, and tools stay local. Presence is ephemeral.
- Validate untrusted imports and peer data. Bound objects, payloads, queues, assembly buffers, and connection attempts.
- Preserve TURN-only defaults. Direct networking must be explicitly enabled and selected; never silently downgrade.
- Keep room keys out of server requests, logs, and saved preferences. Do not commit secrets, invitations, private boards, or learner data.
- Personal saving stays opt-in; shared-room saving requires an explicit action. Do not add analytics or external assets casually.
- Use strict TypeScript, clear names, two spaces, semicolons, and single quotes. Preserve keyboard access, dialog focus, visible focus, and the semantic Objects panel.

## Checks and handoff

- Run `npm run check` for substantive changes. Run browser smoke tests for transport or interaction changes when an installed compatible browser is available.
- Test meaningful failure modes and update affected documentation. A direct-mode test does not establish live TURN operation.
- Report what changed, actual checks, and material limitations. Do not claim DPG recognition, license certification, security assessment, or accessibility conformance without evidence.
- Hosting, branch protection, private reporting, and formal DPG recognition require separate operator or maintainer setup; do not imply they are configured.
