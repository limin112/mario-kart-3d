#!/bin/bash
# Pi 持续 loop 守护进程：一轮接一轮跑 pi 迭代，中间只歇 90 秒。
# 由 mario-kart-pi-loop cron（watchdog）保活；VM 重启后 watchdog 会拉起。
set -u
PROJ="$HOME/workspace/mario-kart-3d"
PIDFILE="$PROJ/scripts/daemon.pid"
LOG="$PROJ/scripts/daemon.log"

# 单例：已有活着的 daemon 就退出
if [ -f "$PIDFILE" ]; then
  OLDPID="$(cat "$PIDFILE" 2>/dev/null)"
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    echo "[daemon] already running as $OLDPID, exiting" >> "$LOG"
    exit 0
  fi
fi
echo $$ > "$PIDFILE"
echo "[daemon] started $$ at $(date '+%F %T')" >> "$LOG"

while true; do
  echo "[daemon] === round start $(date '+%F %T') ===" >> "$LOG"
  bash "$PROJ/scripts/loop-iteration.sh" >> "$LOG" 2>&1
  echo "[daemon] round exit=$? at $(date '+%F %T'), sleeping 90s" >> "$LOG"
  sleep 90
done
