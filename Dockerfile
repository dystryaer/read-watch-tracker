# Read-Watch-Tracker web app for an own server (SPEC §11). Build: docker compose build
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Full workspace: also used by the one-shot "migrate" service in docker-compose.yml.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @rwt/web build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
