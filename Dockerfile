FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy all package files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/
COPY apps/*/package.json ./apps/

# Copy full source
COPY . .

# Install dependencies
RUN pnpm install --no-frozen-lockfile --ignore-scripts

# Build all workspace packages (server -> apps/server/dist) and the web app
RUN pnpm build
RUN cd apps/web && pnpm build

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start server from compiled artifacts (matches local production flow)
CMD ["node", "apps/server/dist/index.js"]
