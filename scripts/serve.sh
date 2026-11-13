#!/usr/bin/env bash
# Rebuilds and restarts the production server on port 3000 (used before screenshots and smoke tests).
set -e
pkill -9 -f "next-server" 2>/dev/null || true; sleep 1
npx next build 2>&1 | grep -E "rror|Compiled|Failed" || true
(PORT=3000 nohup npx next start > "${1:-/tmp/next.log}" 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null --noproxy '*' http://localhost:3000/ && break; sleep 0.5; done
echo "server ready"
