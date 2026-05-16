# `@shamba/web`

Web application for Shamba Traceability — Next.js 15 with the App Router, React 19, TypeScript, and Tailwind CSS.

## Audiences served

| Surface             | Audience                                     | Auth     |
| ------------------- | -------------------------------------------- | -------- |
| `/`                 | Public marketing / landing page              | Anonymous |
| `/qr/[batchId]`     | Consumer-facing provenance journey           | Anonymous |
| `/dashboard`        | Cooperative, processor, exporter, auditor    | Required |
| `/audit/[shipment]` | EU competent authorities and auditors        | Required (auditor role) |
| `/docs`             | Developer + compliance documentation         | Anonymous |

## Local development

```bash
pnpm install
pnpm --filter @shamba/web dev
```

Then visit <http://localhost:3000>.

## Environment

Copy the root `.env.example` to `.env.local` and fill in the variables this app needs (`NEXT_PUBLIC_APP_URL`, Hedera testnet IDs, database URL, etc.).
