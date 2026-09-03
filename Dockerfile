# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────
# 多階段建置：最終映像只含執行期需要的東西
#
# 大小比較：完整的 node_modules + 原始碼約 500MB+，
# 而只帶 .output 的最終映像約 150MB。
# 更小的映像 = 更快的部署、更小的攻擊面。
# ─────────────────────────────────────────────────────────────────────────

# ── 階段 1：安裝相依套件 ────────────────────────────────────────────────
FROM node:22-alpine AS deps

# 只裝 pnpm 需要的最小工具
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

# 先只複製 manifest —— 只要相依沒變，這一層的快取就會命中，
# 改程式碼不需要重新安裝套件，建置快很多
COPY package.json pnpm-lock.yaml ./

# --frozen-lockfile：lock 檔與 package.json 不一致時直接失敗，
# 確保映像裡的版本與開發時完全相同
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --ignore-scripts

# ── 階段 2：建置 ────────────────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN pnpm build

# ── 階段 3：執行 ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0

# 以非 root 使用者執行：容器一旦被攻破，攻擊者拿到的權限也有限。
# node 映像內建 uid/gid 1000 的 node 使用者，直接沿用即可。
USER node

# Nitro 的 .output 是自包含的：已經把用到的相依打包進去，
# 不需要再帶 node_modules 或原始碼
COPY --from=build --chown=node:node /app/.output ./.output

EXPOSE 3000

# 健康檢查用 liveness 端點（不檢查外部依賴，見 server/api/health.get.ts）
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 直接執行 node 而不透過 npm/pnpm：
# 中間多一層 process 會讓 SIGTERM 無法正確傳遞，導致 graceful shutdown 失效
CMD ["node", ".output/server/index.mjs"]
