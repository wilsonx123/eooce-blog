# ---------- 階段 1：構建前端 ----------
FROM node:24-alpine AS web-build
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

# ---------- 階段 2：後端依賴（better-sqlite3 需要 native 編譯工具） ----------
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 階段 3：運行時 ----------
# 容器內不運行 Vite：前端構建產物由 Express 託管，單端口對外提供整站
# 預設 PORT=3001 與 start.sh 的端口約定一致，可用 -e PORT=xxxx 覆蓋
FROM node:24-alpine
ENV NODE_ENV=production

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY --from=web-build /build/dist ./web/dist

# SQLite 數據目錄（建議掛載卷持久化）
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/site >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "start"]
