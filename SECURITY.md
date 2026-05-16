# Security Policy

The Shamba Traceability project takes security seriously. Because the platform is used to make regulatory and commercial decisions about agricultural commodities, a vulnerability here can have downstream effects on farmers, exporters, importers, and consumers. We are grateful to the security community for helping us protect them.

## Supported versions

Until we tag `1.0.0`, only the latest minor release receives security fixes. After `1.0.0`, the support matrix will be published here and in the release notes.

| Version  | Status                         |
| -------- | ------------------------------ |
| `0.x`    | Pre-release; latest minor only |
| `>= 1.0` | Defined per release (post-1.0) |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately via one of the following channels, in order of preference:

1. **GitHub Security Advisory** — Go to the repository's _Security_ tab and click _Report a vulnerability_. This opens an encrypted, private discussion with the maintainers.
2. **Email** — security@shambarecords.com. If you would like to encrypt your report, request our PGP key in the first message; we will reply with the current public key fingerprint.

Please include:

- A description of the issue and the impact you believe it has.
- Steps to reproduce, ideally with a minimal proof-of-concept.
- The affected version, commit, or deployment.
- Whether you intend to disclose publicly, and on what timeline.
- Whether you would like to be credited (and how) in the eventual advisory.

We acknowledge receipt within **two business days** and aim to provide an initial assessment within **seven calendar days**.

## Scope

In scope:

- This repository's source code and the binaries and container images it produces.
- Smart contracts under `packages/contracts/`.
- The Hedera publisher service and any other service in `services/`.
- The web application in `apps/web/`.
- Build, release, and CI/CD configurations in this repository.

Out of scope (please report to the relevant upstream):

- Vulnerabilities in third-party dependencies that we ship unchanged — please coordinate with the upstream maintainer; we will track and update once they release a fix.
- Issues in deployments operated by parties other than Shamba Records Limited unless those deployments are running the unmodified upstream code.
- Social-engineering of project maintainers, employees, or contributors.

## Coordinated disclosure

We follow coordinated disclosure:

1. You report privately; we acknowledge.
2. We confirm and triage; we agree on a fix and a target disclosure date with you.
3. We develop the fix, ideally in a private fork; we coordinate with downstream operators who run Shamba Traceability in production where applicable.
4. We release the fix, publish a GitHub Security Advisory, request a CVE if appropriate, and credit you in the advisory unless you prefer to remain anonymous.

Default disclosure timeline: **90 days from initial report**, extendable by mutual agreement (for complex on-chain issues that require migration, for example).

## Safe-harbour for security researchers

We will not pursue legal action against, or report to law enforcement, security researchers who:

- Make a good-faith effort to comply with this policy;
- Avoid privacy violations, destruction of data, and degradation of service;
- Do not exploit a vulnerability beyond what is necessary to demonstrate it;
- Give us reasonable time to fix the issue before public disclosure.

This statement does not, and is not intended to, create any third-party rights or contractual obligations.

## On-chain considerations

Vulnerabilities affecting deployed Hedera smart contracts deserve special handling because state cannot simply be patched. If you discover such an issue:

- Treat all on-chain details as sensitive; do not exploit beyond proof.
- Expect that disclosure may be delayed beyond 90 days while we coordinate a contract migration, a treasury pause, or a recovery transaction.
- We will credit you and may, at our discretion, offer a bounty proportional to severity and impact.

## Sensitive data

Shamba Traceability handles personal data of farmers and field workers in jurisdictions covered by GDPR, Kenya's Data Protection Act, and similar regimes. Personal data is **never** written to a public ledger — only hashes and commitments are. If you find a flow that violates this invariant, treat it as a high-severity report.

## Contact

- Security reports: security@shambarecords.com
- General contact: hello@shambarecords.com
- Code of Conduct concerns: conduct@shambarecords.com
