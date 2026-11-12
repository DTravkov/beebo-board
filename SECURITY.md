# Security policy

Beebo is an initial implementation undergoing review. No independent security assessment has been completed. Trusted small groups may evaluate it locally; public classroom deployment needs the outstanding safeguards listed in [the roadmap](docs/ROADMAP.md).

## Reporting

Use this repository's GitHub private vulnerability reporting feature or a private security advisory **if the steward has enabled it**. Do not put tokens, invitations, learner data, or exploitable details in a public issue.

**Outstanding setup:** the repository steward must enable private reporting or publish a monitored private security address before a public service or supported release. No response-time commitment or verified private reporting channel exists yet. See [governance](docs/GOVERNANCE.md).

Reports should describe the affected commit/version, reproduction steps with synthetic data, expected impact, and suggested mitigation. Acknowledgments and coordinated disclosure will be agreed with the reporter.

## Boundaries and current limits

- A room invitation is a shared read/write capability. All invited participants are editors. There is no per-user revocation, key rotation, or teacher-only role.
- AES-GCM protects room payloads against parties without the shared key. It does not protect against invited malicious editors, compromised browsers, or a hosting operator serving malicious JavaScript.
- Endpoint memory and opt-in IndexedDB storage are not encrypted at rest. Exported files contain plaintext board content.
- Input validation and size limits reduce exposure but do not eliminate denial-of-service risks in CRDT decoding or native browser/network components.
- The signaling service uses in-memory quotas and rooms. Multi-instance deployment, distributed rate limiting, reconnect automation, and comprehensive load testing are not implemented.
- Operators must provide HTTPS, TURN credentials and quotas, restricted origins, log retention policies, and independent relay/host dependency audits.
- Package lifecycle scripts are disabled. The automated license gate is not a security scanner; run `npm audit` as well and review advisories in context.

Use synthetic content for security tests. Never test against other users' rooms without authorization.
