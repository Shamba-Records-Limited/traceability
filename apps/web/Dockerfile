# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Shamba web app. Targets the Next.js
# `standalone` output so the final image carries only the compiled
# server + the minimum node_modules subset that Next's tracer
# determined is actually used. No pnpm in the runtime image, no
# workspace metadata, no devDependencies.
#
# Build from the monorepo root:
#   docker build -f apps/web/Dockerfile -t shamba-web .
#
# Run:
#   docker run -p 3000:3000 --env-file .env shamba-web

# ---- base ------------------------------------------------------------------
ARG NODE_VERSION=22-bookworm-slim
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- deps stage: install workspace dependencies ----------------------------
FROM base AS deps
# Copy the manifests first so layer caching is meaningful — `pnpm install`
# only re-runs when something in the lockfile or a package.json changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile

# ---- build stage: compile the Next app ------------------------------------
FROM base AS build
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PHASE=phase-production-build
# Pull every node_modules tree pnpm created. pnpm's isolated linker
# materialises a per-package node_modules at each workspace directory
# (each one full of symlinks back to /app/node_modules/.pnpm/...).
# Next.js `transpilePackages` compiles the workspace packages from
# source at build time, and module resolution starts at each
# transpiled file's directory — so packages/db/src/schema/actors.ts
# resolving `import 'drizzle-orm'` needs `packages/db/node_modules`
# to exist. Carrying just the root and apps/web tree wasn't enough.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY . .
# `next build` needs a NEXT_PUBLIC_APP_URL at build time so the metadataBase
# is correct in the emitted RSC payload. Pass via --build-arg or accept the
# localhost default. Other env vars (DATABASE_URL, AUTH_SECRET, ...) are
# runtime-only and supplied via docker-compose / Caddy / .env.
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
RUN pnpm --filter @shamba/web build

# ---- runtime stage --------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Use a non-root user. Next 16 standalone output is happy under uid 1001.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# `output: standalone` emits a self-contained server bundle at
# .next/standalone with a node-runnable server.js. Plus .next/static
# (already inside) and public/. Copy in that exact order.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# The standalone server lives under `apps/web/server.js` inside the
# tarred-up structure. Same entry point next-start would invoke.
CMD ["node", "apps/web/server.js"]
