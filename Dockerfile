# Apify Actor image. Build stage bundles TypeScript with esbuild; the runtime stage has production deps only.
FROM apify/actor-node:22 AS builder
COPY --chown=myuser:myuser package*.json ./
RUN npm ci --include=dev --audit=false --fund=false
COPY --chown=myuser:myuser . ./
RUN npm run check-engine && npm run build

FROM apify/actor-node:22
COPY --chown=myuser:myuser package*.json ./
RUN npm ci --omit=dev --omit=optional --audit=false --fund=false \
    && echo "Node.js $(node --version), npm $(npm --version)" \
    && rm -rf ~/.npm
COPY --from=builder --chown=myuser:myuser /usr/src/app/dist ./dist
COPY --chown=myuser:myuser .actor ./.actor
CMD ["node", "dist/main.js"]
