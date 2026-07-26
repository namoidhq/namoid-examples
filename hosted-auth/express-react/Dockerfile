FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable \
    && corepack prepare pnpm@10.20.0 --activate

FROM base AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build \
    && pnpm prune --prod

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV="production"
ENV PORT=3003

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 namoid

COPY --from=builder --chown=namoid:nodejs /app/package.json ./
COPY --from=builder --chown=namoid:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=namoid:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=namoid:nodejs /app/client/dist ./client/dist

USER namoid
EXPOSE 3003

CMD ["node", "server/dist/index.js"]
