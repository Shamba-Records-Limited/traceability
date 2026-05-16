<!-- Thanks for contributing to Shamba Traceability! -->
<!-- Read CONTRIBUTING.md if you haven't already. -->

## Summary

<!-- One or two sentences: what changes, and why. -->

## Motivation

<!-- What problem does this solve? Link to issues, ADRs, or compliance documents
where relevant (e.g. "Closes #123", "Implements ADR-0002", "EUDR Article 9(1)(d)"). -->

## Changes

<!-- Bullet list of the high-level changes. Reviewers should be able to skim this
and know where to focus. -->

-

## Type of change

<!-- Tick all that apply. -->

- [ ] `feat` — new user-visible feature
- [ ] `fix` — bug fix
- [ ] `refactor` — internal restructure with no behaviour change
- [ ] `perf` — performance improvement
- [ ] `docs` — documentation
- [ ] `test` — tests
- [ ] `chore` / `ci` — tooling, CI, dependencies
- [ ] `security` — security hardening (no vulnerability disclosure here)

## EUDR / compliance impact

<!-- If this change affects EUDR compliance (data collected, risk assessment,
DDS schema, retention, etc.), note the affected article(s) and update
docs/compliance/eudr-mapping.md in this PR. -->

- [ ] No compliance impact
- [ ] EUDR mapping updated in `docs/compliance/eudr-mapping.md`
- [ ] Other regulatory mapping updated (specify)

## On-chain schema impact

<!-- Smart contract changes, HCS event vocabulary changes, HTS token model
changes — all have downstream consumers. -->

- [ ] No on-chain change
- [ ] HCS event vocabulary changed (bump version, update event.ts)
- [ ] HTS token schema changed (note migration plan)
- [ ] Smart contract changed (note deploy plan and audit status)

## Security impact

<!-- Trust boundaries crossed, secrets added, new auth flows, key custody, PII
flows. If any boxes below are ticked, request a CODEOWNER review. -->

- [ ] No security impact
- [ ] New trust boundary or new external input
- [ ] Authentication / authorisation change
- [ ] Key custody change
- [ ] New PII flow (and GDPR notes updated)

## Tests

<!-- How was this verified? What automated tests were added or updated? -->

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual verification (describe below)

<!-- Manual verification notes: -->

## Documentation

- [ ] User-facing docs updated (apps/docs)
- [ ] Engineering docs updated (`docs/`)
- [ ] Inline comments / godoc / tsdoc updated where helpful
- [ ] No documentation change needed

## Checklist

- [ ] Commit messages follow Conventional Commits
- [ ] Commits are signed off (`git commit -s`) — DCO
- [ ] PR title follows Conventional Commits (CI enforces this)
- [ ] Branch name follows `<type>/<short-kebab>` (CONTRIBUTING.md §Branching)
- [ ] CI is green
- [ ] No AI-tool attribution in commit messages or PR body
