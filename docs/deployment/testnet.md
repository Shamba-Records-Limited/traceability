# Free Hedera-testnet deployment runbook

End-to-end walkthrough for getting **Shamba Traceability** onto a public URL
with **real Hedera testnet** anchors, at zero hosting cost. Following this
guide takes ~3 hours of focused work and uses free tiers from five providers.

The end state:

- `apps/web` on Vercel at `https://<your-project>.vercel.app`
- Postgres + PostGIS on Neon
- Magic-link email via Resend
- `services/hedera-publisher` Go service on Fly.io
- Smart contracts (`PlotRegistry`, `BatchRegistry`) deployed to Hedera testnet
- Optional: real Global Forest Watch deforestation provider

Every plot registration, batch mint, and DDS issuance lands on Hedera
testnet. NFTs are visible on [Hashscan testnet](https://hashscan.io/testnet).

## 1. Prereq accounts (~30 min)

You create these; no payment information needed for any of them except
Fly.io (CC required, won't be charged on free tier).

### a. Hedera testnet portal

1. Go to <https://portal.hedera.com/register>.
2. Sign up with email; verify.
3. Create a **testnet account**. You'll receive:
   - `OPERATOR_ID` (form `0.0.<num>`)
   - `OPERATOR_PRIVATE_KEY` (DER-encoded hex string starting with `302e02...`)
   - **1000 testnet HBAR** auto-funded (refills daily via the same portal).
4. Repeat for a `TREASURY_ID` + `TREASURY_PRIVATE_KEY` — the treasury account
   holds HTS NFT collections on behalf of users. Same portal, second
   account.

**Cost**: free. Testnet HBAR has no real-world value.

### b. Vercel

1. <https://vercel.com/signup> → sign in with GitHub (recommended).
2. Authorise the Shamba GitHub org so Vercel can read the repo.
3. Don't create a project yet; we'll do that from the CLI.

**Cost**: free Hobby tier (100 GB bandwidth/mo, custom domains free).

### c. Neon (Postgres + PostGIS)

1. <https://console.neon.tech> → sign up.
2. Create a project. Pick the **AWS region closest to your users** (eu-west-1
   if you're targeting EU importers).
3. Once the project exists, open the SQL editor and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
4. Copy the **pooled connection string** (Connection Details → Pooled
   connection). Looks like:
   ```
   postgres://USER:PASS@HOST.aws.neon.tech/neondb?sslmode=require
   ```
   Save this; you'll paste it as `DATABASE_URL` later.

**Cost**: free tier (0.5 GB storage, autopauses after inactivity).

### d. Resend (magic-link email)

1. <https://resend.com> → sign up.
2. Stay on the free tier (3 000 emails/mo, 100/day).
3. **For the first demo**: use the test sender `onboarding@resend.dev`
   (works immediately, no domain setup).
4. **For a real domain later**: add a DNS record for SPF + DKIM (Resend's
   onboarding walks you through it).
5. Generate an **API key** under Settings → API Keys. Save it for later.

**Cost**: free.

### e. Fly.io (Go publisher hosting)

1. <https://fly.io/app/sign-up> → sign up (GitHub or email).
2. Add a credit card during signup — required, but you won't be charged
   on the free allowances.
3. Install `flyctl`: <https://fly.io/docs/hands-on/install-flyctl/>.
4. From your terminal: `flyctl auth login`.

**Cost**: free (within the small-VM allowance; ~$0.60/mo of usage but
fully absorbed by their free credit).

### f. Global Forest Watch Data API key (optional)

If you want **real** deforestation checks instead of the always-pass mock:

1. <https://www.globalforestwatch.org/my-gfw/> → sign up.
2. Request an API key under "API Keys".
3. Approval is automatic and instant.

Skip this entirely for a first demo — the mock provider always reports
"no deforestation" which is fine for showing flows.

**Cost**: free.

## 2. Deploy the Postgres schema (~5 min)

From your local machine, with the Neon connection string in hand:

```sh
cd packages/db
DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require" pnpm db:migrate
```

This runs every migration `0000_init.sql` through `0010_certifications.sql`
against your Neon database. Should take under a minute.

Verify in the Neon SQL editor:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
```

Expect ~15 tables.

## 3. Deploy the Go publisher to Fly.io (~30 min)

The publisher signs HTS/HCS/contract transactions with the operator
account. It needs to be reachable by Vercel.

```sh
cd services/hedera-publisher
flyctl launch --no-deploy
```

Pick a unique app name (e.g. `shamba-publisher-yourname`). The launch
wizard generates a `fly.toml`. Then set secrets:

```sh
flyctl secrets set \
  HEDERA_NETWORK=testnet \
  HEDERA_OPERATOR_ID=0.0.YOUR_OPERATOR_ID \
  HEDERA_OPERATOR_PRIVATE_KEY=YOUR_OPERATOR_PRIVATE_KEY \
  HEDERA_TREASURY_ID=0.0.YOUR_TREASURY_ID \
  HEDERA_TREASURY_PRIVATE_KEY=YOUR_TREASURY_PRIVATE_KEY
```

Then deploy:

```sh
flyctl deploy
```

The app URL will be `https://shamba-publisher-yourname.fly.dev`. Test:

```sh
curl https://shamba-publisher-yourname.fly.dev/healthz
# {"status":"ok"}
curl https://shamba-publisher-yourname.fly.dev/readyz
# {"mode":"real","status":"ok"}
```

If `readyz` shows `"mode":"mock"` instead of `"real"`, double-check the
operator credentials in `flyctl secrets list`.

## 4. Deploy the EVM registry contracts (~30 min)

The Solidity contracts in `contracts/` need to be deployed to Hedera
testnet via JSON-RPC.

```sh
cd contracts
forge install foundry-rs/forge-std --no-commit
```

Set up the JSON-RPC relay env vars. **HashIO** is a free Hedera-managed
relay:

```sh
export FOUNDRY_RPC_URL="https://testnet.hashio.io/api"
# Convert your Hedera private key to its raw 32-byte hex form
# (strip the DER prefix). Tools like https://hederahero.com/key-converter
# can do this, or you can use a quick Node one-liner:
#   node -e "console.log(require('@hashgraph/sdk').PrivateKey.fromStringDer('YOUR_OPERATOR_PRIVATE_KEY').toStringRaw())"
export PRIVATE_KEY="0xRAW_32_BYTE_HEX"

forge script script/Deploy.s.sol --rpc-url $FOUNDRY_RPC_URL --broadcast
```

The script will print two EVM addresses:

```
PlotRegistry EVM address: 0xABCD...
BatchRegistry EVM address: 0xEFGH...
```

Resolve each to a Hedera `0.0.<num>` ID via the mirror node:

```sh
curl "https://testnet.mirrornode.hedera.com/api/v1/contracts/0xABCD..." | jq .contract_id
# "0.0.6789012"
```

Save the two `0.0.<num>` IDs as `HEDERA_PLOT_REGISTRY_ID` and
`HEDERA_BATCH_REGISTRY_ID`.

## 5. Deploy the web app to Vercel (~30 min)

```sh
npm install -g vercel
cd apps/web
vercel link  # creates a Vercel project, links the repo
```

Set environment variables (use the Vercel dashboard or `vercel env add`):

| Variable                      | Value                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `production`                                                                                |
| `NEXT_PUBLIC_APP_URL`         | `https://<your-project>.vercel.app`                                                         |
| `NEXT_PUBLIC_HASHSCAN_BASE`   | `https://hashscan.io/testnet`                                                               |
| `AUTH_SECRET`                 | `openssl rand -base64 32`                                                                   |
| `AUTH_URL`                    | `https://<your-project>.vercel.app`                                                         |
| `EMAIL_SERVER_HOST`           | `smtp.resend.com`                                                                           |
| `EMAIL_SERVER_PORT`           | `465`                                                                                       |
| `EMAIL_SERVER_USER`           | `resend`                                                                                    |
| `EMAIL_SERVER_PASSWORD`       | your Resend API key                                                                         |
| `EMAIL_FROM`                  | `onboarding@resend.dev` (or your verified sender)                                           |
| `DATABASE_URL`                | Neon pooled connection string                                                               |
| `HEDERA_PUBLISHER_URL`        | `https://shamba-publisher-yourname.fly.dev`                                                 |
| `HEDERA_PUBLISHER_TIMEOUT_MS` | `15000`                                                                                     |
| `HEDERA_DID_ISSUER_URL`       | _(optional, leave blank for now — DIDs use a placeholder until we deploy this service too)_ |
| `CRON_SECRET`                 | `openssl rand -base64 32`                                                                   |
| `DEFORESTATION_PROVIDER`      | `mock` (or `gfw` if you got a GFW key)                                                      |
| `GFW_API_KEY`                 | _(only if `DEFORESTATION_PROVIDER=gfw`)_                                                    |
| `REGISTRY_CONTRACTS_ENABLED`  | `true`                                                                                      |
| `HEDERA_PLOT_REGISTRY_ID`     | `0.0.XXX` from step 4                                                                       |
| `HEDERA_BATCH_REGISTRY_ID`    | `0.0.YYY` from step 4                                                                       |
| `HEDERA_REGISTRY_GAS_LIMIT`   | `500000`                                                                                    |

Deploy:

```sh
vercel --prod
```

You should see the deploy succeed within a few minutes. Visit the URL.

## 6. Smoke test (~30 min)

Open the public URL → sign in via magic link → onboard as a Cooperative →
register a plot → wait ~15 seconds → confirm the plot list shows a
Hashscan link to a real HCS topic on testnet.

Then create a batch from that plot. Confirm:

1. The batch list shows an HTS token id + serial; click it to see the
   NFT on Hashscan.
2. The batch row also shows the EVM registry tx; click to see the
   transaction on Hashscan.
3. Click "Trace + QR" — the public consumer page loads, includes the
   inline QR code, and shows the on-chain anchor at the bottom.

If any of these fail, check:

- Fly.io logs: `flyctl logs --app shamba-publisher-yourname`
- Vercel runtime logs: `vercel logs <deployment-url> --follow`
- Hedera operator balance: <https://hashscan.io/testnet> — paste your
  `OPERATOR_ID`. If you're under ~5 HBAR, the auto-fund link at
  `portal.hedera.com` refills it.

## 7. Keep it free

- **Neon autopauses** after inactivity. First request after a pause
  takes ~5 seconds. Acceptable for demos.
- **Vercel free tier** allows 1 cron schedule. The reconciler is wired
  for every 5 minutes. Don't add a second cron without upgrading.
- **Fly.io**: keep the publisher on a single 256 MB shared VM. Don't
  scale to a dedicated machine.
- **Resend**: don't blast magic links. 100/day is the soft limit;
  bursting over triggers a temporary block.
- **Hedera testnet**: refill HBAR daily from the portal. The publisher
  burns ~0.05 HBAR per plot/batch including all on-chain anchors.

## 8. Promotion to mainnet (future)

When you're ready to go from testnet to mainnet:

1. Buy mainnet HBAR on a Hedera-supporting exchange. ~30 HBAR ($1-2) covers
   the contract deploys.
2. Repeat step 3 (publisher Fly.io) with `HEDERA_NETWORK=mainnet` and
   mainnet operator credentials.
3. Repeat step 4 (contract deploy) with a mainnet JSON-RPC URL
   (`https://mainnet.hashio.io/api`).
4. Update Vercel env vars: `NEXT_PUBLIC_HASHSCAN_BASE`, the registry IDs,
   the publisher URL.

The DB doesn't change; existing records keep their off-chain history. New
events anchor to mainnet from the flip moment onward.
