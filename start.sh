#!/bin/bash
# 一鍵啓動：檢測/安裝 Node.js → 構建前端 → 安裝後端依賴 → 啓動服務（單端口）
set -euo pipefail

cd "$(dirname "$0")"

NODE_MIN_MAJOR=22
FNm_INSTALL_URL="https://fnm.vercel.app/install"

log()  { printf '\033[1;32m[start]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[start]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 1. 檢測 Node.js，缺失或版本過低則用 fnm 安裝 24 ----------
needs_node=0
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  current="$(node -v | sed 's/^v//')"
  major="${current%%.*}"
  if [ "${major:-0}" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    log "已安裝 Node.js v${current} / npm $(npm -v)"
  else
    warn "Node.js v${current} 版本過低（要求 ≥ ${NODE_MIN_MAJOR}），改用 fnm 安裝 Node.js 24"
    needs_node=1
  fi
else
  warn "未檢測到 Node.js，開始安裝"
  needs_node=1
fi

if [ "$needs_node" -eq 1 ]; then
  if ! command -v fnm >/dev/null 2>&1; then
    command -v curl >/dev/null 2>&1 || die "缺少 curl，無法安裝 fnm，請先安裝 curl 或手動安裝 Node.js 24"
    log "安裝 fnm"
    curl -o- "$FNm_INSTALL_URL" | bash
    # 官方腳本把 fnm 裝在 ~/.local/share/fnm（舊版為 ~/.fnm），當前 shell 需手動加入 PATH
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
  fi
  command -v fnm >/dev/null 2>&1 || die "fnm 安裝失敗（伺服器缺少 unzip 等依賴時請先補裝），或手動安裝 Node.js 24 後重試"

  eval "$(fnm env --shell bash)"
  log "通過 fnm 安裝 Node.js 24"
  fnm install 24
  fnm use 24
  fnm default 24 >/dev/null 2>&1 || true

  command -v node >/dev/null 2>&1 || die "Node.js 安裝後仍不可用，請檢查 fnm 配置"
  log "Node.js 版本: $(node -v)"
  log "npm 版本:    $(npm -v)"
fi

# ---------- 2. 構建前端（web/ → web/dist） ----------
log "安裝前端依賴（web/）"
cd web
npm install
log "構建前端產物"
npm run build
cd ..

# ---------- 3. 安裝後端依賴 ----------
log "安裝後端依賴"
npm install

# ---------- 4. 啓動服務 ----------
export PORT="${PORT:-3001}"
log "啓動服務：http://localhost:${PORT}（Ctrl+C 退出）"
exec npm run start