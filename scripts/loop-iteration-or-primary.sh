#!/bin/bash
# Pi 游戏开发 loop：OpenRouter 优先变体（Qwen 只留兜底）——草稿，未启用。
#
# 背景：2026-10-13 主 chat 待拍板事项"Pi 主通道切 OpenRouter 免费、Qwen 只留兜底"。
# 起因：Qwen 大 prompt（~70KB/两三万 token）流式必断 `Stream ended without finish_reason`，
# 小请求探针一直 200 → 探针永远"通过"但真实轮次连跪，熔断器同日触发两次 30 分钟休眠。
# 用户立场：Qwen 不要垄断机制；Qwen 彻底空出来给他自己用。
#
# 与 loop-iteration.sh 同结构，仅通道优先级反转：
#   1) OpenRouter primary（nvidia/nemotron-3-ultra-550b-a55b:free）
#   2) 429/限流/quota/503 → OpenRouter fallback（nvidia/nemotron-3-super-120b-a12b:free）
#   3) 配额耗尽（free-models-per-day）或代理不通 → Qwen 兜底（strata/qwen-flash，保留熔断）
#   4) Qwen 探针也不过 → 睡 600s（等 UTC 午夜配额重置）
#
# 启用（等用户明确说"改"之后，一条命令即生效）：
#   cp "$HOME/workspace/mario-kart-3d/scripts/loop-iteration-or-primary.sh" \
#      "$HOME/workspace/mario-kart-3d/scripts/loop-iteration.sh"
# daemon 每轮（90s 间隔）直接调 loop-iteration.sh，下一轮即生效，无需重启服务。
# 回滚：git checkout -- scripts/loop-iteration.sh（loop-iteration.sh 在版本控制内）。
#
# 通道验证（2026-10-13 ~11:00 +08，or-probe.py 实测 MODEL_PRIMARY）：
#   chat_ok=true，finish_reason=stop，tool_calls 可用（Pi 的核心需求）。
# 注意：OpenRouter 免费层每日 1000 次（UTC 午夜重置）；用量见顶时本脚本自动回落 Qwen 兜底。
set -u
PROJ="$HOME/workspace/mario-kart-3d"
export PATH="$HOME/.pi/agent/bin:$PATH"
export OR_PROXY_PORT=18080
MODEL_QWEN='strata/qwen-flash'
MODEL_PRIMARY='openrouter-free/nvidia/nemotron-3-ultra-550b-a55b:free'
MODEL_FALLBACK='openrouter-free/nvidia/nemotron-3-super-120b-a12b:free'

# Qwen 健康检查：max_tokens=4 的非流式 chat 真探针，超时 20s；连续两次失败才算 down。
# （relay.py 透明透传不加鉴权，worker3 要求 Bearer key，故现取现用 models.json 里的 strata key，不落盘。
# 用户本地机器睡觉/离线时这里不通，直接跳过，避免 pi 空转。）
qwen_up() {
  local i r
  for i in 1 2; do
    r="$(python3 -c "
import json, os, urllib.request
try:
    key = json.load(open(os.path.expanduser('~/.pi/agent/models.json')))['providers']['strata']['apiKey']
    body = json.dumps({'model': 'qwen3.8-flash-next-ud-iq4-xs-128k',
                       'messages': [{'role': 'user', 'content': 'ping'}],
                       'max_tokens': 4, 'stream': False}).encode()
    req = urllib.request.Request('http://127.0.0.1:18182/v1/chat/completions', data=body,
                                 headers={'Authorization': 'Bearer ' + key,
                                          'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=20)
    d = json.load(resp)
    print(200 if (resp.status == 200 and d.get('choices')) else 0)
except Exception:
    print(0)
")"
    [ "$r" = "200" ] && return 0
    sleep 3
  done
  return 1
}

# Qwen 兜底分支（2026-10-13 用户明确要求撤掉熔断机制：不再计数、不再休眠，失败只记录）。
qwen_fallback() {
  local RC
  echo "[loop] $(date '+%F %T') openrouter unavailable, falling back to qwen (last resort)" >> "$PROJ/scripts/loop-runs.log"
  if ! qwen_up; then
    echo "[loop] $(date '+%F %T') qwen also down, sleeping 600s" >> "$PROJ/scripts/loop-runs.log"
    sleep 600
    return 0
  fi
  echo "[loop] $(date '+%F %T') qwen up, running round with $MODEL_QWEN" >> "$PROJ/scripts/loop-runs.log"
  run_pi "$MODEL_QWEN"
  RC=$?
  echo "[loop] $(date '+%F %T') pi exit=$RC (qwen fallback)" >> "$PROJ/scripts/loop-runs.log"
  return $RC
}

# 1. 确保 or-proxy 存活
if ! curl -s -m 5 http://127.0.0.1:18080/v1/models -o /dev/null; then
  nohup python3 "$HOME/workspace/skills/openrouter/bin/or-proxy.py" \
    >> "$PROJ/scripts/proxy.log" 2>&1 &
  echo $! > "$PROJ/scripts/proxy.pid"
  sleep 3
fi

# 1b. 清理上一轮残留的 subagent（正常 Pi 自己会收尾；这里兜底防跑飞）
for pf in "$PROJ/scripts"/subagent-*.pid; do
  [ -e "$pf" ] || continue
  SPID="$(cat "$pf" 2>/dev/null)"
  if [ -n "$SPID" ] && kill -0 "$SPID" 2>/dev/null; then
    echo "[loop] $(date '+%F %T') killing stale subagent $SPID ($pf)" >> "$PROJ/scripts/loop-runs.log"
    kill "$SPID" 2>/dev/null
  fi
  rm -f "$pf"
done

# 2. 跑一轮 Pi（25 分钟超时，无会话，每轮靠 STATE.md 交接）
cd "$PROJ"
PROMPT="$(cat "$PROJ/scripts/iteration-prompt.txt")"
OUT="$PROJ/scripts/last-run-output.txt"
: > "$OUT"
run_pi() {
  timeout 1500 pi -p --no-session --model "$1" "$PROMPT" </dev/null >> "$OUT" 2>&1
}

# 2a. OpenRouter 优先
run_pi "$MODEL_PRIMARY"
RC=$?

# 主模型若因限流/配额失败，降级到 120b 再试一次
if [ $RC -ne 0 ] && grep -qi -E "429|rate.?limit|quota|overloaded|503" "$OUT"; then
  echo "[loop] $(date '+%F %T') primary hit rate limit, retrying with fallback" >> "$PROJ/scripts/loop-runs.log"
  run_pi "$MODEL_FALLBACK"
  RC=$?
fi

# 2b. OpenRouter 不可用（配额耗尽 free-models-per-day / 代理不通 / 连续失败）→ Qwen 兜底
if [ $RC -ne 0 ]; then
  if grep -qi "free-models-per-day" "$OUT"; then
    echo "[loop] $(date '+%F %T') OR free quota exhausted, trying qwen fallback" >> "$PROJ/scripts/loop-runs.log"
  fi
  qwen_fallback
  RC=$?
fi

# 3. 收尾：记录本轮退出码（Pi 自己负责更新 STATE.md/LOG.md）
echo "[loop] $(date '+%F %T') pi exit=$RC (or-primary variant)" >> "$PROJ/scripts/loop-runs.log"
exit $RC
