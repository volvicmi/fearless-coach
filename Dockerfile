FROM node:24-bookworm-slim

WORKDIR /app

# Dependencies first: this layer stays cached while package*.json don't change.
# --ignore-scripts skips `nuxt prepare` here, the build below does the same work.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Then the source and the build
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# The SQLite database lives in /app/data: mount a persistent volume there.
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
