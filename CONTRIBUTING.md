# Contributing to Beebo Board

Contributions that improve collaborative learning, access, privacy, and reliable operation are welcome. Start with an issue describing the user need, expected behavior, and a small proposed scope. Security reports follow [SECURITY.md](SECURITY.md).

## Branches and Pull Requests

**All initialization work and all subsequent changes must enter `main` through a Pull Request. Never commit or push directly to `main`.**

Create a distinct branch for every feature or bug fix:

```sh
git switch main
git pull --ff-only
git switch -c feature/short-description
# or: git switch -c fix/short-description
```

Use a fresh `feature/` branch for documentation or tooling work as well. Keep one coherent change per branch; do not reuse merged branches. The pre-existing repository license commit is the historical baseline.

PR descriptions should state the problem, resulting behavior, checks performed, and any remaining limits. Include screenshots for visible interface changes. Merge only after review and required checks pass. The repository steward must enable the branch protection described in [GOVERNANCE.md](docs/GOVERNANCE.md).

## Rights and license hygiene

By submitting a contribution, you confirm that you may contribute it under Apache-2.0. You retain your copyright. Preserve required third-party notices and document the provenance of copied or adapted code, images, fonts, fixtures, and generated assets. AI-assisted contributions follow the same rules.

Only permissive dependencies are accepted. GPL, AGPL, LGPL, MPL, EPL, CDDL, proprietary-only terms, and unknown licenses are excluded under this project's policy. An `OR` expression may have an approved permissive alternative; an `AND` expression must satisfy every obligation. Review actual notices and bundled code, not just a package badge. See [LICENSE_POLICY.md](docs/LICENSE_POLICY.md).

Pin direct dependency versions, update the lockfile intentionally, inspect all changed dependencies, regenerate the SBOM/notices/evidence, and run the license gate. Never suppress a failed gate to merge a change. New allowlist entries or packaging exceptions require documented permissive-license evidence and review.

## Development

Use Node.js 22.12+ and npm. Run `npm ci`, then `npm run dev`. Read [README.md](README.md) for environment setup and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for component boundaries.

- Use strict TypeScript and descriptive names. Run `npm run format` for the checked-in Prettier style (two spaces, semicolons, and single quotes).
- Keep rendering, shared schema, transport, and signaling responsibilities separate.
- Keep additions small enough to review. Avoid new dependencies when a standard browser or Node API is sufficient.
- Treat imports, signaling messages, peer updates, and presence as untrusted input.
- Preserve payload/queue limits, origin checks, relay-only defaults, and local-saving consent.
- Do not log room tokens, invitation fragments, board content, learner identities, SDP, or ICE candidates.
- Keep keyboard operation and responsive layouts usable; label controls and provide a semantic alternative to canvas interactions.
- Do not add telemetry or remote assets without an explicit product/privacy decision.

## Validation

Run `npm run check` before requesting review. When changing transport, canvas interaction, or room UI, also build and run `npm run test:browser` with an installed compatible Chromium browser.

Write behavior-focused tests for substantive changes: concurrent edits and convergence, local undo, malformed imports, crypto failures, room admission/limits, origin rejection, reconnect behavior, or permission boundaries as applicable. Small copy/style-only edits need relevant review and build checks rather than tests that mirror the implementation.

The live TURN path requires an operator-configured relay; do not describe a direct-mode test as relay validation. Report the exact verification gap when infrastructure is unavailable.

## Community conduct

Respect learners and contributors across abilities, identities, languages, backgrounds, and levels of experience. Harassment, doxxing, intimidation, discriminatory abuse, and sharing personal learner data without permission are not acceptable. Review code and ideas constructively. Repository maintainers may remove harmful content or restrict participation.

Contact a repository maintainer privately for sensitive conduct concerns. Before public community operation, the steward must publish a monitored private contact and enforcement responsibilities; see the open item in [GOVERNANCE.md](docs/GOVERNANCE.md).
