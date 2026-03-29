# Cache bust: 2026-03-29 - rebuild with correct NEXT_PUBLIC_BACKEND_URL=https://suna-backend-production-dc72.up.railway.app/api
FROM node:20-slim

WORKDIR /app

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the entire monorepo (lockfile, workspace config, all packages)
COPY . .

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Declare build-time args for NEXT_PUBLIC_* variables so Railway's injected
# service variables are available when Next.js inlines them into the client bundle.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_URL
ARG NEXT_PUBLIC_ENV_MODE

# Build the frontend workspace package
RUN pnpm --filter Kortix build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "cd apps/frontend && pnpm start"]
