# Contributing

Keep changes focused, readable, and easy to review. See the [README](README.md) to get started.

## Workflow

1. Create a fresh `feature/short-description` or `fix/short-description` branch.
2. Make your changes and preserve unrelated work.
3. Run the relevant checks and update affected documentation.
4. Open a pull request describing the change and how you tested it. Include screenshots for UI changes.

All changes need human review. Never push directly to `main` or merge your own pull request.

## Checks

```sh
npm --prefix frontend run check
```

Run browser tests for UI or sharing changes, and backend tests for backend changes. Follow the existing code style and format changed files.

## Licensing and privacy

Contributions use [Apache-2.0](LICENSE). Preserve copyright and license notices.

Use permissively licensed dependencies, including their transitive dependencies. Pin direct versions and update the relevant lockfile and [third-party notices](THIRD_PARTY_NOTICES.txt) together.

Be respectful. Preserve privacy defaults and keyboard access. Never commit secrets, invitations, private boards, or learner data.

See [AGENTS.md](AGENTS.md) for the detailed repository rules.
