FROM node:20-slim

WORKDIR /app

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the entire monorepo (lockfile, workspace config, all packages)
COPY . .

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Build the frontend workspace package
RUN pnpm --filter Kortix build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "cd apps/frontend && pnpm start"]
