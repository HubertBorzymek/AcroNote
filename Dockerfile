# AcroNote production image (used by Fly.io: `fly deploy`).
# Build stage: install everything, build shared + web + api, then keep only runtime dependencies.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund
COPY . .
ARG ACRONOTE_VERSION=""
ENV ACRONOTE_VERSION=${ACRONOTE_VERSION}
RUN npm run build && rm -rf node_modules && npm ci --omit=dev --no-audit --no-fund

# Runtime stage: compiled code, production node_modules and the built frontend.
FROM node:24-slim
WORKDIR /app
ARG ACRONOTE_VERSION=""
ENV NODE_ENV=production \
    ACRONOTE_ENV=production \
    ACRONOTE_VERSION=${ACRONOTE_VERSION} \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/data/acronote.db \
    LOG_LEVEL=info
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/web/package.json ./packages/web/
COPY --from=build /app/packages/web/dist ./packages/web/dist
EXPOSE 3001
# The SQLite database lives on the mounted volume (/data); it must not be baked into the image.
CMD ["node", "apps/api/dist/server.js"]
