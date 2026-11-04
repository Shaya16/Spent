# Spent in a container: the app, its scrapers and Chromium are isolated from the host,
# and the database and encryption key live in the /data volume.

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    # The default scraper drives Chromium; use Debian's package instead of a downloaded browser.
    PUPPETEER_SKIP_DOWNLOAD=true

FROM base AS build
COPY package.json package-lock.json ./
# No dependency install scripts: better-sqlite3 and sharp ship prebuilt binaries, and Chromium comes from Debian.
# The one script that matters, the scraper fork's playwright patch, is run explicitly.
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && node node_modules/@sergienko4/israeli-bank-scrapers/scripts/patch-playwright-core.mjs
COPY . .
# Tests run as part of the build: if they fail, no image is produced and the running version stays.
RUN npm test
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data && chown node:node /data
ARG SPENT_COMMIT=unknown
ENV NODE_ENV=production \
    SPENT_DATA_DIR=/data \
    SPENT_COMMIT=${SPENT_COMMIT} \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=build --chown=node:node /app /app
USER node
VOLUME ["/data"]
EXPOSE 41234
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:41234/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Inside the container the app must listen on all interfaces; compose publishes it on the host's 127.0.0.1 only.
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "41234"]
