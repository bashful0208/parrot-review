# ---- Stage 1: Install dependencies ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json ./packages/core/
COPY packages/git/package.json packages/git/tsconfig.json ./packages/git/
COPY packages/ai/package.json packages/ai/tsconfig.json ./packages/ai/
COPY packages/db-types/package.json ./packages/db-types/
COPY apps/worker/package.json apps/worker/tsconfig.json ./apps/worker/

RUN echo 'public-hoist-pattern[]=*' >> .npmrc && pnpm install --frozen-lockfile

# ---- Stage 2: Build workspace packages + worker ----
FROM deps AS builder
WORKDIR /app

COPY packages/core/ ./packages/core/
COPY packages/git/ ./packages/git/
COPY packages/ai/ ./packages/ai/
COPY packages/db-types/ ./packages/db-types/
COPY apps/worker/ ./apps/worker/

RUN pnpm --dir packages/core run build \
  && pnpm --dir packages/git run build \
  && cd packages/ai && sed 's/"noEmit": true/"noEmit": false, "declaration": true/' tsconfig.json > tsconfig.build.json && npx tsc -p tsconfig.build.json --outDir dist && sed -i 's|./src/index.ts|./dist/index.js|g' package.json \
  && cd /app && pnpm --dir apps/worker run build

# ---- Stage 3: Production runner ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/

RUN rm -rf packages/*/src packages/*/node_modules packages/*/tsconfig*.json packages/ai/tsconfig.build.json

CMD ["node", "apps/worker/dist/index.js"]
