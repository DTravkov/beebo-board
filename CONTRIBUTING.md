# Contributing

## Workflow

Create a new `feature/short-description` or `fix/short-description` branch for each change, including documentation and tooling. All changes enter `main` through a human-reviewed Pull Request. Never commit or push directly to `main`, merge your own PR, or rewrite shared history without authorization.

Keep each PR focused. Describe the problem, resulting behavior, actual checks run, and remaining limits. Include screenshots for UI changes. Preserve unrelated working-tree changes.

## Development and testing

Use Node.js 22.12+ and npm. Run `npm ci` and `npm run dev`; see [README.md](README.md) and [architecture](docs/ARCHITECTURE.md).

Use strict TypeScript, descriptive names, two spaces, semicolons, and single quotes. Format changed files with Prettier. Keep the shared schema, rendering, transport, and server separate.

Run `npm run check` before review. For canvas, room, or transport changes, also run `npm run test:browser` against the built app using an installed Chromium browser. Focus tests on behavior that can fail: concurrent edits, imports, admission, malformed peers, and interaction. Report live TURN testing separately from local direct-mode tests.

## Licenses

Contributions are Apache-2.0. Confirm you have the rights to contributed code and assets, including copied or generated material, and preserve copyright and license notices.

Application dependencies must offer a permissive license such as MIT, Apache-2.0, BSD, or ISC. Copyleft-only packages (including GPL, AGPL, LGPL, and MPL), proprietary terms, and unknown licenses are excluded. Inspect direct, transitive, development, optional, platform-specific, and bundled components; a package badge alone is insufficient. Review dual-license expressions and bundled notices against the actual terms.

Pin direct versions, inspect the lockfile diff, and update `THIRD_PARTY_NOTICES.txt` when dependencies change. The production build includes the project license and third-party notices. License review is a contributor responsibility; there is no automated license gate. Standard infrastructure images are allowed under their own component licenses and are outside the application's permissive-only dependency rule.

## Privacy and conduct

Treat imported files and peer messages as untrusted. Preserve validation, resource limits, TURN-only defaults, opt-in local saving, keyboard access, and the Objects panel. Do not add analytics or remote assets without an explicit product decision. Never commit or log secrets, invitations, board content, or learner data.

Be respectful. Harassment, discrimination, doxxing, and sharing personal learner data without permission are unacceptable. Maintainers may remove harmful content or restrict participation. Send sensitive concerns privately; security reporting and the current contact gap are described in [SECURITY.md](SECURITY.md).
