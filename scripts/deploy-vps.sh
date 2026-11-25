#!/usr/bin/env bash
# Build Unlock locally and deploy it to the VPS (systemd service "unlock" behind Apache).
#   ./scripts/deploy-vps.sh                 # uses defaults below
#   VPS=root@host SITE=https://… ./scripts/deploy-vps.sh
# Secrets live on the server in /etc/unlock.env (root-only); they are never uploaded by this script.
set -euo pipefail
VPS="${VPS:-root@162.35.99.74}"
SITE="${SITE:-https://unlock-bch.pages.dev}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

rsync -a --exclude .next --exclude .scratch --exclude .data --exclude .vercel --exclude .git --exclude /xo --exclude '.env*' "$ROOT/" "$BUILD/"
# Public build-time values only (NEXT_PUBLIC_*). Server secrets are read at runtime from /etc/unlock.env.
grep '^NEXT_PUBLIC_' "$ROOT/.env.local" 2>/dev/null | grep -v '^NEXT_PUBLIC_SITE_URL=' > "$BUILD/.env.production.local" || true
echo "NEXT_PUBLIC_SITE_URL=$SITE" >> "$BUILD/.env.production.local"
(cd "$BUILD" && STANDALONE=1 npx next build)
rm -f "$BUILD"/.next/standalone/.env*
cp -r "$BUILD/public" "$BUILD/.next/standalone/"
cp -r "$BUILD/.next/static" "$BUILD/.next/standalone/.next/static"

rsync -az --delete "$BUILD/.next/standalone/" "$VPS:/opt/unlock/app/"
ssh "$VPS" 'chown -R unlock:unlock /opt/unlock && systemctl restart unlock && sleep 4 && systemctl is-active unlock'
curl -fsS -o /dev/null -w "Live: %{http_code} $SITE\n" "$SITE/api/config"
