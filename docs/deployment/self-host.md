# Self-hosting Shamba Traceability with Docker

This guide deploys the full Shamba stack on a single Linux host using
Docker Compose: Caddy (reverse proxy + automatic TLS) → Next.js web
app → Go publisher service → Go DID-issuer service → PostgreSQL with
PostGIS → optional Mailpit for inspecting magic-link emails during
testing.

It's intentionally **simple**: one host, one compose file, one TLS
domain. Production deployments will eventually want a managed Postgres,
external SMTP, a CDN for static assets, and probably a separate VM for
the Go publisher — but this single-host path is the right starting
point for cooperatives, exporters, or any organisation wanting to run
their own instance under the AGPL.

## What you need before starting

| Requirement                                                     | Why                                                       | How                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A Linux host** with Docker 24+ and Docker Compose v2          | Runs everything                                           | Debian 12, Ubuntu 22.04 LTS, or any modern distro. 4 vCPU / 8 GB RAM / 40 GB disk is comfortable. |
| **Root or sudo** on the host                                    | Bind ports 80/443, install Docker                         | Standard sysadmin access                                                                          |
| **A DNS hostname**                                              | Caddy auto-provisions Let's Encrypt                       | Point an A record at the host's public IP. For LAN-only deploys, see "LAN-only" below.            |
| **A Hedera account** (operator) and a second account (treasury) | Pays HBAR fees, holds NFT collections                     | <https://portal.hedera.com/register> — free testnet credentials                                   |
| (Optional) GFW Data API key                                     | Real deforestation checks instead of the always-pass mock | <https://www.globalforestwatch.org/my-gfw/>                                                       |

If the host is behind NAT and you want public access, port-forward
80/tcp and 443/tcp (and 443/udp for HTTP/3) to the host. Caddy needs
ports 80 + 443 for ACME HTTP-01 challenges.

## 1. Install Docker on the host

```sh
# Debian / Ubuntu
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER     # log out / back in for this to take effect
```

Verify:

```sh
docker version
docker compose version
```

## 2. Clone the repo

```sh
git clone https://github.com/Shamba-Records-Limited/traceability.git
cd traceability
```

## 3. Fill in the environment

```sh
cp infra/self-host/.env.example infra/self-host/.env
nano infra/self-host/.env   # or vim, whatever you have
```

The template has comments next to every variable. The mandatory ones
are:

- `SHAMBA_DOMAIN` — your DNS hostname
- `ACME_EMAIL` — your contact email for Let's Encrypt
- `NEXT_PUBLIC_APP_URL` — `https://<your domain>`
- `AUTH_SECRET` — `openssl rand -base64 32`
- `POSTGRES_PASSWORD` — `openssl rand -base64 24`
- `HEDERA_OPERATOR_ID` + `HEDERA_OPERATOR_PRIVATE_KEY`
- `HEDERA_TREASURY_ID` + `HEDERA_TREASURY_PRIVATE_KEY`
- `CRON_SECRET` — `openssl rand -base64 32`

Everything else has sensible defaults or is optional.

**LAN-only deploys**: if `SHAMBA_DOMAIN` isn't public, Caddy will fail
the ACME challenge. To use a self-signed internal cert instead, edit
the global block at the top of `infra/self-host/Caddyfile` to add
`auto_https disable_certs` — or use any FQDN you trust manually
provisioning a cert for.

## 4. Bring the stack up

```sh
docker compose -f infra/self-host/docker-compose.yml up -d --build
```

First build takes ~5 minutes (downloads base images, compiles Next.js

- the Go publisher, runs `pnpm install` for ~30 workspace deps). Once
  running:

```sh
docker compose -f infra/self-host/docker-compose.yml ps
```

Expect six healthy services: `caddy`, `web`, `hedera-publisher`,
`did-issuer`, `postgres`, `mailpit`. The web service points at the
in-stack `did-issuer` by default (`http://did-issuer:8081`), which is
what rotates the `did:hedera:pending:*` placeholder DIDs on actor
records into real `did:hedera:testnet:*` values as the reconciler
runs.

## 5. Run the DB migrations

The web app expects the Postgres schema to be in place. Migrations
live in `packages/db/drizzle` and apply via a Drizzle migrator:

```sh
docker compose -f infra/self-host/docker-compose.yml exec -T \
  -e DATABASE_URL="postgres://shamba:${POSTGRES_PASSWORD}@postgres:5432/shamba?sslmode=disable" \
  web \
  sh -c 'cd /app && node apps/web/server.js' # placeholder for the migrator command

# In practice run migrations from your dev box with the connection
# string pointed at the host's Postgres port (forwarded via SSH or
# exposed):
DATABASE_URL="postgres://shamba:${POSTGRES_PASSWORD}@<your-host>:5432/shamba?sslmode=disable" \
  pnpm --filter @shamba/db db:migrate
```

A future PR ships a one-shot `migrator` service inside the compose
file so step 5 happens automatically; for now run it from your dev
box once.

## 6. Deploy the EVM smart contracts (optional)

If you want the EVM registry layer active, the contracts have to be
deployed to Hedera testnet once. From your dev box (Foundry needs to
run somewhere with internet + your operator key):

```sh
cd contracts
forge install foundry-rs/forge-std --no-commit

FOUNDRY_RPC_URL="https://testnet.hashio.io/api" \
PRIVATE_KEY="0x<your operator HEX private key>" \
forge script script/Deploy.s.sol \
  --rpc-url $FOUNDRY_RPC_URL \
  --broadcast \
  --legacy
```

Note the printed EVM addresses, resolve them to Hedera contract IDs:

```sh
curl "https://testnet.mirrornode.hedera.com/api/v1/contracts/0x<addr>" | jq -r .contract_id
```

Paste the two `0.0.<num>` values into `infra/self-host/.env` as
`HEDERA_PLOT_REGISTRY_ID` and `HEDERA_BATCH_REGISTRY_ID`, set
`REGISTRY_CONTRACTS_ENABLED=true`, and restart the web service:

```sh
docker compose -f infra/self-host/docker-compose.yml restart web
```

## 7. Smoke test

1. Browse to `https://<your domain>`.
2. Sign in with any email; if you're using the in-stack Mailpit,
   either open it via SSH tunnel (`ssh -L 8025:localhost:8025`) or set
   `SHAMBA_MAILPIT_DOMAIN` in `.env`.
3. Click the magic link.
4. Onboard as a Cooperative.
5. Register a plot. Wait ~20s. Refresh — confirm the Hashscan link
   appears for the HCS topic.
6. Create a batch. Confirm the HTS NFT shows up on Hashscan via the
   token id + serial.

## 8. Day-2 operations

### Logs

```sh
docker compose -f infra/self-host/docker-compose.yml logs -f web
docker compose -f infra/self-host/docker-compose.yml logs -f hedera-publisher
docker compose -f infra/self-host/docker-compose.yml logs -f caddy
```

### Updating

```sh
git pull
docker compose -f infra/self-host/docker-compose.yml up -d --build
```

### Database backups

```sh
docker compose -f infra/self-host/docker-compose.yml exec -T postgres \
  pg_dump -U shamba shamba | gzip > shamba-$(date +%F).sql.gz
```

Restore:

```sh
gunzip -c shamba-2026-05-21.sql.gz | docker compose -f infra/self-host/docker-compose.yml \
  exec -T postgres psql -U shamba shamba
```

### HBAR balance monitoring

The publisher account burns ~0.05 ℏ per on-chain commitment. Top up
from <https://portal.hedera.com> (testnet) or your favourite exchange
(mainnet) when the balance drops below ~10 ℏ. The publisher logs a
soft warning when on-chain calls fail; budget alerting is a future
follow-up.

### Switching to managed Postgres

When you outgrow the in-stack Postgres, point the web service at an
external `DATABASE_URL` (Neon / Crunchy / RDS / DigitalOcean managed
postgres) and remove the `postgres` and `postgres_data` entries from
the compose file. Migrate the data with `pg_dump | psql`.

### Switching to managed SMTP

Set `EMAIL_SERVER_HOST` + `EMAIL_SERVER_PORT` + `EMAIL_SERVER_USER` +
`EMAIL_SERVER_PASSWORD` + `EMAIL_FROM` to your provider (Resend,
Mailgun, SES, Postmark). Stop the in-stack Mailpit service.

## 9. Going to production

Things to revisit before pointing real users at this:

- **Pin image tags**. `caddy:2.8-alpine` and `postgis/postgis:16-3.4-alpine`
  are good defaults but pin the exact digest in production
  (`image: caddy@sha256:...`) so a base-image bump doesn't surprise
  you mid-incident.
- **Monitoring**. Wire `docker compose ps` into your uptime tool;
  Prometheus + Grafana is the natural next layer.
- **Backups off-host**. `pg_dump` into S3 / B2 / Cloudflare R2 on cron.
- **Container hardening**. The Dockerfiles already run as non-root
  inside, but consider running the compose stack under a non-root
  user on the host (rootless Docker) for an extra layer.
- **Firewall**. Only 80 + 443 should be reachable from the public
  internet. Block 5432 (Postgres), 8025 (Mailpit), 1025 (SMTP) at
  the host firewall.
- **Secret rotation**. `AUTH_SECRET`, `POSTGRES_PASSWORD`, `CRON_SECRET`,
  and Hedera keys should all be rotated on a documented schedule.
