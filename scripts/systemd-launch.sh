#!/bin/bash
# systemd 启动包装：没有 egress 代理环境变量就拒绝启动（exit 3），
# 等看门狗注入后再由 systemd 重试。避免 or-proxy 在无代理环境下空转。
set -u
if [ -z "${HTTPS_PROXY:-}" ]; then
  echo "[launch] $(date '+%F %T') no HTTPS_PROXY in environment, exit 3 (wait for watchdog to inject)" >&2
  exit 3
fi
export PATH="/home/hatch/.pi/agent/bin:$PATH"
exec /bin/bash /home/hatch/workspace/mario-kart-3d/scripts/loop-daemon.sh
