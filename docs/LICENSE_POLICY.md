# Permissive dependency policy

Project contributions use Apache-2.0. Dependencies must have an approved permissive licensing path. Copyleft-only dependencies, including GPL, AGPL, LGPL, MPL, EPL, and CDDL, are excluded. Proprietary-only, unknown, missing, and unresolved license terms fail review. This is a project policy stricter than DPG's general open-licensing requirement.

## Automated gate

`scripts/license-policy.mjs` contains the explicit allowlist. Its expression parser requires `AND` terms to pass together; `OR` needs an approved alternative. Unknown IDs, exceptions (`WITH`), malformed expressions, and trailing tokens fail. This does not waive required attribution or other obligations.

Approved identifiers are MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, and ISC, plus these reviewed permissive cases:

- **0BSD:** permissive zero-clause BSD, present in Rollup's bundled notices.
- **CC0-1.0:** public-domain dedication/fallback grant, present in Vite's bundled notices.
- **BlueOak-1.0.0:** permissive copyright/patent grant with notice requirements, present in playwright-core's bundled minimatch notice.

No exception admits a copyleft-only dependency. The initial Vite 8 tree was rejected because it introduced MPL-2.0 lightningcss; the final lockfile uses Vite 7 and does not contain that dependency. Vite's built-in JSX transformation also avoids the additional React build-plugin tree.

The gate inventories every lockfile package, including development, optional, and other-platform packages, checks installed metadata, recursively reads installed license/notice files, flags copyleft markers and unapproved explicit bundled license labels, and checks SBOM freshness. It preserves full available notices and SHA-256 evidence when generating artifacts.

This is a useful automated policy check, **not a complete source-file, native-binary, or legal audit**. Obscure bundled terms can require manual inspection. Optional artifacts not installed on the current platform receive metadata-only evidence. Regenerate notices and audit the actual artifacts on each release build platform.

## Reviewed packaging gaps

These exact versions omit their own standalone license text. The gate uses documented upstream evidence rather than silently skipping them:

| Package                                     | Evidence                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@esbuild/*` 0.28.2 platform binaries       | Main `esbuild` package's MIT license; [upstream license](https://github.com/evanw/esbuild/blob/main/LICENSE.md)                                                                                                                                                                                               |
| `@rollup/rollup-*` 4.68.2 platform binaries | Main `rollup` package's complete MIT/bundled license notices; [upstream license](https://github.com/rollup/rollup/blob/master/LICENSE.md)                                                                                                                                                                     |
| `abstract-logging` 2.0.1                    | Its packaged Readme explicitly links MIT. The [author's linked license grant](https://jsumners.mit-license.org/) is preserved in `docs/licenses/abstract-logging-2.0.1-MIT.txt`; author identity also appears in [upstream attribution](https://github.com/remy/mit-license/blob/master/users/jsumners.json). |

Version changes require checking these evidence sources again. Parent notices do not establish a complete audit of compiler toolchains used upstream to create native binaries.

## Scope of tools and deployment

The npm dependency gate applies to packages introduced by this repository. Existing Git, npm, Node distribution components, installed browsers, operating-system packages, CI runners, reverse proxies, and operator-managed TURN services are separate environment inputs, not certified or redistributed by the npm inventory. Git uses GPL; npm's CLI license is Artistic-2.0 and its dependencies have their own terms. Their use as pre-existing development infrastructure must not be represented as a fully permissive host-toolchain audit.

`playwright-core` is Apache-2.0 with additional permissive bundled notices. No Playwright browsers, FFmpeg bundle, or browser container image are installed by this project; tests use an operator-supplied existing browser. coturn is a proposed external BSD-3-Clause service, whose chosen distribution and dependencies require their own review. A deployment with a literal no-copyleft policy across all infrastructure needs a separately audited environment.

The Compose topology now requires explicit digest-pinned image inputs and human image-review records; it supplies no automatically approved stock images. Stock coturn containers include additional database/HTTP components, and common container base OS packages include copyleft terms. A top-level project's permissive license does not clear those image contents. See [the image contracts and deployment gate](../deploy/README.md). The npm inventory's lockfile digest normalizes CRLF/LF so Git checkout line endings do not invalidate the same dependency inventory across platforms.

## Dependency changes and releases

1. Pin a direct version and inspect the full lockfile diff, provenance, advisories, and actual license files.
2. Inspect bundled notices, native artifacts, fonts, icons, fixtures, and copied code. System fonts and original SVG icons avoid downloaded asset licensing.
3. Reject incompatible dependencies or document an approved permissive licensing path and preserve notices.
4. Run `npm run licenses:generate`, inspect the SBOM/notices/evidence diff, then run `npm run check`.
5. Include the project license and generated notices with distributions. The build copies license, third-party notices, and SBOM into the static output.
6. Audit platform-specific artifacts on every release target; do not infer a Linux binary inspection from a Windows build.

Reference: [SPDX expression semantics](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/). License evidence is intended to support review; it is not a legal clearance opinion.
