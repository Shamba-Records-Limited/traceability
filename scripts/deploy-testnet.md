# Testnet deploy — operator workflow

Step-by-step you follow on your machine. Keys live in `.env.deploy.local`
which is gitignored; they never touch the chat transcript.

## 0. Sanity check the env file

```sh
cp .env.deploy.template .env.deploy.local
# fill it in with your editor of choice

# Confirm git ignores it:
git check-ignore .env.deploy.local
# Should print: .env.deploy.local
# If nothing prints, STOP and add it to .gitignore.
```

## 1. Migrate the Neon database

```sh
# Load env vars
set -a; source .env.deploy.local; set +a

cd packages/db
DATABASE_URL="$DATABASE_URL" pnpm db:migrate
cd ../..
```

Verify in the Neon SQL editor:
```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
```
Expect ~15 tables.

## 2. Deploy the publisher to Fly.io

```sh
cd services/hedera-publisher

# Edit fly.toml — set `app = "$FLY_PUBLISHER_APP"` (your chosen name)
# Then launch the app (one-time):
flyctl launch --no-deploy --copy-config --name "$FLY_PUBLISHER_APP"

# Push the secrets (Fly stores them encrypted; they never appear in env logs):
flyctl secrets set \
  HEDERA_NETWORK=testnet \
  HEDERA_OPERATOR_ID="$HEDERA_OPERATOR_ID" \
  HEDERA_OPERATOR_PRIVATE_KEY="$HEDERA_OPERATOR_PRIVATE_KEY_DER" \
  HEDERA_TREASURY_ID="$HEDERA_TREASURY_ID" \
  HEDERA_TREASURY_PRIVATE_KEY="$HEDERA_TREASURY_PRIVATE_KEY_DER" \
  --app "$FLY_PUBLISHER_APP"

# Deploy:
flyctl deploy --app "$FLY_PUBLISHER_APP"

# Test:
curl "https://$FLY_PUBLISHER_APP.fly.dev/healthz"
# Expect: {"status":"ok"}
curl "https://$FLY_PUBLISHER_APP.fly.dev/readyz"
# Expect: {"mode":"real","status":"ok"}
# If "mode":"mock", credentials weren't picked up — run `flyctl secrets list`.

cd ../..
```

## 3. Deploy the EVM registry contracts

```sh
cd contracts
forge install foundry-rs/forge-std --no-commit  # one-time
forge build  # sanity-build

# Deploy via HashIO's free testnet JSON-RPC relay:
FOUNDRY_RPC_URL="https://testnet.hashio.io/api" \
PRIVATE_KEY="$HEDERA_OPERATOR_PRIVATE_KEY_HEX" \
forge script script/Deploy.s.sol \
  --rpc-url "$FOUNDRY_RPC_URL" \
  --broadcast \
  --legacy   # Hedera EVM uses legacy tx format

# Note the printed EVM addresses:
#   PlotRegistry  EVM address: 0xAAAA...
#   BatchRegistry EVM address: 0xBBBB...

# Resolve each to a Hedera 0.0.<num> ID:
curl "https://testnet.mirrornode.hedera.com/api/v1/contracts/0xAAAA..." | jq -r .contract_id
curl "https://testnet.mirrornode.hedera.com/api/v1/contracts/0xBBBB..." | jq -r .contract_id

# Paste the resulting 0.0.<num> values into .env.deploy.local:
#   HEDERA_PLOT_REGISTRY_ID=0.0.AAAA
#   HEDERA_BATCH_REGISTRY_ID=0.0.BBBB

cd ..
```

## 4. Deploy the web app to Vercel

```sh
cd apps/web
vercel link  # one-time; pick "create new project" with the name
             # "shamba-traceability"

# Push env vars in bulk (you'll be prompted to confirm each):
set -a; source ../../.env.deploy.local; set +a

vercel env add NEXT_PUBLIC_APP_URL production
# Paste: https://shamba-traceability.vercel.app  (we'll know the final URL
# only after the first deploy, but this is the convention)

vercel env add AUTH_SECRET production
# Generate: openssl rand -base64 32

vercel env add AUTH_URL production
# Paste: same as NEXT_PUBLIC_APP_URL

vercel env add EMAIL_SERVER_HOST production
# Paste: smtp.resend.com

vercel env add EMAIL_SERVER_PORT production
# Paste: 465

vercel env add EMAIL_SERVER_USER production
# Paste: resend

vercel env add EMAIL_SERVER_PASSWORD production
# Paste: $RESEND_API_KEY

vercel env add EMAIL_FROM production
# Paste: $EMAIL_FROM (e.g. onboarding@resend.dev)

vercel env add DATABASE_URL production
# Paste: $DATABASE_URL

vercel env add HEDERA_PUBLISHER_URL production
# Paste: https://$FLY_PUBLISHER_APP.fly.dev

vercel env add CRON_SECRET production
# Generate: openssl rand -base64 32

vercel env add DEFORESTATION_PROVIDER production
# Paste: mock  (or `gfw` if you got a GFW key)

vercel env add REGISTRY_CONTRACTS_ENABLED production
# Paste: true

vercel env add HEDERA_PLOT_REGISTRY_ID production
# Paste: $HEDERA_PLOT_REGISTRY_ID

vercel env add HEDERA_BATCH_REGISTRY_ID production
# Paste: $HEDERA_BATCH_REGISTRY_ID

# Now deploy:
vercel --prod

# Vercel prints the final URL (https://...vercel.app). Hit it in a browser.
```

## 5. Smoke test (the part that proves it works)

1. Open the Vercel URL → click "Sign in" → enter your email.
2. Check Resend's dashboard ("Logs") to confirm the email actually sent.
3. Click the magic link in the email.
4. Onboard as `Cooperative` in `KE` with display name "Acme Coffee Co".
5. Register a plot — fill in a polygon (the sample polygon in the form is fine).
6. Wait ~20 seconds (HCS publish + EVM registry write).
7. Refresh the plot list — you should see:
   - A Hashscan link showing the real HCS topic on testnet.
   - The polygon rendered on the OpenStreetMap basemap.
8. Click the topic link → opens Hashscan → confirms the on-chain message exists.

## 6. If something fails

| Symptom | Likely cause | Where to look |
|---|---|---|
| `vercel --prod` fails on the build | Some env var missing | `vercel env ls production` |
| Plot creation hangs | Publisher unreachable | `flyctl logs --app $FLY_PUBLISHER_APP` |
| `(pending HCS commit)` never clears | Reconciler not running | Vercel → Functions → `/api/cron/reconcile` runtime logs |
| Magic-link email never arrives | Resend block / wrong sender | Resend dashboard → Logs |
| `forge script` fails with "insufficient funds" | Operator HBAR depleted | `portal.hedera.com` → Refill button |
| HCS publish works, EVM registry doesn't | `REGISTRY_CONTRACTS_ENABLED` not set or wrong contract IDs | Vercel env vars |

## 7. Production-tag the deploy

Once smoke-test passes, give it a git tag:

```sh
git tag -a v0.1.0-testnet -m "First public testnet deploy"
git push origin v0.1.0-testnet
gh release create v0.1.0-testnet --title "First testnet deploy"
```

The release URL is the demo URL you hand to anyone.
