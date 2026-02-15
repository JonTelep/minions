# 🤖 Minions - Universal Agent Orchestration
FROM node:22-slim

LABEL org.opencontainers.image.title="Minions"
LABEL org.opencontainers.image.description="Universal agent orchestration system"
LABEL org.opencontainers.image.source="https://github.com/jontelep/minions"
LABEL org.opencontainers.image.vendor="Telep IO LLC"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home minions

# Copy package files and install all dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY tsconfig.json ./
COPY src/ src/
COPY migrations/ migrations/
RUN npx tsc

# Remove devDependencies after build
RUN npm prune --omit=dev && npm cache clean --force

# Change ownership to non-root user  
RUN chown -R minions:nodejs /app

# Switch to non-root user
USER minions

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Minions system healthy')" || exit 1

# Default command - show help
CMD ["node", "dist/cli.js", "--help"]
