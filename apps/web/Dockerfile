# ---- Stage 1: Install dependencies ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json ./packages/core/
COPY packages/git/package.json packages/git/tsconfig.json ./packages/git/
COPY packages/db-types/package.json ./packages/db-types/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN echo 'public-hoist-pattern[]=*' >> .npmrc && pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM deps AS builder
WORKDIR /app

COPY packages/core/ ./packages/core/
COPY packages/git/ ./packages/git/
COPY packages/db-types/ ./packages/db-types/
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

RUN pnpm --dir packages/core run build \
  && pnpm --dir packages/git run build \
  && cd apps/web && npx next build --webpack

# ---- Stage 3: Production runner ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
