# syntax=docker/dockerfile:1

# ── Stage 1: Builder ──────────────────────────────────────
FROM node:23-slim AS builder

# System deps for native modules (better-sqlite3, canvas, etc.)
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first (better layer caching)
COPY package.json .npmrc ./

# Install production deps only (npm will read .npmrc for legacy-peer-deps)
RUN npm install --omit=dev

# Copy source
COPY . .

# ── Stage 2: Runtime ──────────────────────────────────────
FROM node:23-slim AS runtime

RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

# Disable telemetry
ENV ELIZAOS_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1
ENV NODE_ENV=production
ENV SERVER_PORT=3000

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .npmrc ./
COPY --from=builder /app/characters ./characters
COPY --from=builder /app/src ./src
COPY --from=builder /app/frontend ./frontend

# SQLite data directory (can be mounted as a volume)
RUN mkdir -p /app/data

# ── Ports ──────────────────────────────────────────────────
# 3000 — ElizaOS agent API
EXPOSE 3000

# ── Healthcheck ────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/agents').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
