# `apps/`

User-facing applications. Each app is a standalone deployable that may depend on packages from `packages/` and call services from `services/`.

| App        | Stack                          | Purpose                                                          |
| ---------- | ------------------------------ | ---------------------------------------------------------------- |
| `web`      | Next.js 15 (App Router)        | Cooperative, processor, exporter, auditor portals + consumer QR  |
| `docs`     | (TBD: Nextra or Docusaurus)    | Public developer documentation and EUDR compliance guide         |

New apps are added by opening an ADR proposing the addition.
