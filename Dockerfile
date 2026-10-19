FROM node:24-bookworm-slim

WORKDIR /app

# Dependencies and build (npm ci runs `nuxt prepare`, so the whole source is needed first)
COPY . .
RUN npm ci && npm run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# The SQLite database lives in /app/data: mount a persistent volume there.
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
