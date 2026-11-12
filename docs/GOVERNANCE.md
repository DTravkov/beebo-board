# Ownership and project governance

The initial repository steward is the GitHub account managing [DTravkov/beebo-board](https://github.com/DTravkov/beebo-board). This identifies repository responsibility, not a new legal entity or a claim that the steward owns contributors' work. Contributors retain copyright and submit under Apache-2.0.

Changes enter through Pull Requests on distinct feature/fix branches. Maintainers review product behavior, licensing, privacy, accessibility, and evidence. Major architecture or data-flow changes should update the relevant design documentation. Dependencies and generated code receive the same provenance review as handwritten code.

## Repository settings to configure

These settings cannot be enforced by local Markdown or CI files alone. The steward must configure them in the repository host:

- Protect `main`: require Pull Requests, independent review where available, and the CI `checks` status; disallow force pushes and deletion.
- Enable private vulnerability reporting or publish a monitored private security contact.
- Publish a monitored private conduct contact, identify responsible maintainers, and define escalation/conflict handling.
- Confirm formal project ownership/stewardship, maintainer roles, and release authority before a DPG nomination.

The initial implementation prepares the workflow and CI; it does not claim these remote settings have been enabled. The pre-existing license commit remains the repository baseline. New initialization work belongs on `feature/project-foundation` and reaches `main` through a PR.
