# syntax=docker.io/docker/dockerfile:1
FROM node:22-slim AS base

# ---- Deps Stage ----
# Install workspace dependencies with pnpm, including local workspace
# packages like @agentpress/shared.
FROM base AS deps

WORKDIR /app

# Lockfile mode: use --frozen-lockfile for prod (default), --no-frozen-lockfile for local dev
ARG PNPM_LOCKFILE_MODE=--frozen-lockfile

# Copy only the files needed for dependency resolution and workspace linking.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps ./apps
COPY packages ./packages

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install ALL workspace deps so shared package devDeps (@types/react etc.) are available
# during TypeScript compilation. The filter-only approach skips devDeps of peer packages.
RUN corepack enable pnpm && pnpm install ${PNPM_LOCKFILE_MODE}


# ---- Builder Stage ----
FROM base AS builder
WORKDIR /app

# Bring the fully-installed workspace into the builder image.
COPY --from=deps /app /app

# Build the frontend app from its workspace location.
WORKDIR /app/apps/frontend

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone

# Declare build-time args for NEXT_PUBLIC_* variables.
# Railway passes service environment variables as Docker build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_URL
ARG NEXT_PUBLIC_ENV_MODE

# Make them available as ENV so Next.js can embed them into the static bundle.
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_URL=$NEXT_PUBLIC_URL
ENV NEXT_PUBLIC_ENV_MODE=$NEXT_PUBLIC_ENV_MODE

RUN corepack enable pnpm && pnpm run build


# ---- Runner Stage ----
FROM base AS runner
WORKDIR /app

ENV NEXT_PUBLIC_VERCEL_ENV=production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Use the built-in 'node' user from node:22-slim (uid 1000)
# Copy built frontend assets from the workspace path.
# Next.js standalone output includes everything needed to run the server.
# The standalone directory structure mirrors the workspace, so we copy it as-is.
COPY --from=builder --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=node:node /app/apps/frontend/public ./apps/frontend/public

USER node

EXPOSE 3000

ENV PORT=3000

ENV HOSTNAME="0.0.0.0"
# Next.js standalone output: when COPY --from=builder /app/apps/frontend/.next/standalone ./
# is used, the standalone root is /app. The server.js is at the root of standalone output.
# In a monorepo with transpilePackages, server.js lands at /app/server.js
# Diagnostic: find and run server.js wherever it is in the standalone output
CMD ["sh", "-c", "echo '=== Listing /app ===' && ls -la /app/ && echo '=== Finding server.js ===' && find /app -name 'server.js' -maxdepth 5 2>/dev/null && echo '=== Running server ===' && node $(find /app -name 'server.js' -maxdepth 5 | head -1)"]