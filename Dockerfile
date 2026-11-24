# HAWA TRADERS — lean runtime container. Development/test files are not copied.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Railway persistent volumes are root-owned. gosu allows the entrypoint to
# grant the Node user access to the volume and then drop root privileges.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates gosu \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY server/ ./server/
COPY public/ ./public/
COPY deploy/docker-entrypoint.sh /usr/local/bin/hawa-entrypoint
RUN chmod 755 /usr/local/bin/hawa-entrypoint

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/hawa-entrypoint"]
CMD ["node", "server/server.js"]
