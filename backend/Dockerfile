# Network Automation Center - backend API
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# Application code
COPY src ./src
COPY scripts ./scripts

# Run as an unprivileged user
RUN addgroup -S nac && adduser -S nac -G nac && mkdir -p /var/lib/nac-backups && chown -R nac:nac /app /var/lib/nac-backups
USER nac

EXPOSE 5000

CMD ["node", "src/server.js"]
