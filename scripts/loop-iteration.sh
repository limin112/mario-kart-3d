#!/bin/bash
# Pi 游戏开发 loop：单轮迭代。由 cron 每 30 分钟调用一次。
# 职责：确保 or-proxy 存活 -> 跑一轮 pi -p -> 代理保持运行供下一轮使用。
set -u
PROJ="$HOME/workspace/mario-kart-3d"
export PATH="$HOME/.pi/agent/bin:$PATH"
export OR_PROXY_PORT=18080
MODEL_QWEN='strata/qwen-flash'
MODEL_PRIMARY='openrouter-free/nvidia/nemotron-3-ultra-550b-a55b:free'
MODEL_FALLBACK='openrouter-free/nvidia/nemotron-3-super-120b-a12b:free'

# Qwen 健康检查：2026-10-12 起升级为 chat 真探针（babysit 21:20 指令，Pi 未落实，
# taskmaster 22:27 代落实）。教训：/v1/models 只走中继不经过模型生成，永远 200，
# 而 chat 生成曾静默挂死 1 小时（20:10→21:10 +08，18 轮 Connection error 空转）。
# 探针：max_tokens=4 的非流式 chat，超时 20s；连续两次失败才算 down，然后降级 OpenRouter。
# 注意：relay.py 是透明透传，中继本身不加鉴权，worker3 要求 Bearer key；
# 裸 curl 只会拿到 401，所以这里必须带上 models.json 里的 strata key（现取现用，不落盘）。
# （用户本地机器睡觉/离线时这里不通，直接跳过，避免 pi 空转 25 分钟。）
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

# 1. 确保代理存活（cron 环境变量齐全，surrogate 走 authd+egress 代理）
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

# 2a. Qwen 优先（用户本地免费模型，零成本不限量）：健康检查通过直接跑
if qwen_up; then
  echo "[loop] $(date '+%F %T') qwen up, running round with $MODEL_QWEN" >> "$PROJ/scripts/loop-runs.log"
  run_pi "$MODEL_QWEN"
  RC=$?
  echo "[loop] $(date '+%F %T') pi exit=$RC (qwen)" >> "$PROJ/scripts/loop-runs.log"
  # 注：2026-10-13 用户明确要求撤掉熔断机制（连续失败10次休眠30分钟）。
  # 失败轮只记录退出码，daemon 按正常 90s 间隔开新轮，不再休眠。
  # worker3 是用户自己的部署，只如实记录，绝不动它。
  exit $RC
fi
echo "[loop] $(date '+%F %T') qwen down, falling back to openrouter" >> "$PROJ/scripts/loop-runs.log"

# 2b. Qwen 不可用 → OpenRouter（免费配额每日 1000 次，UTC 午夜重置）
run_pi "$MODEL_PRIMARY"
RC=$?
# 主模型若因限流/配额失败，降级到 120b 再试一次
if [ $RC -ne 0 ] && grep -qi -E "429|rate.?limit|quota|overloaded|503" "$OUT"; then
  echo "[loop] primary model failed, retrying with fallback" >> "$OUT"
  run_pi "$MODEL_FALLBACK"
  RC=$?
fi
# 2c. OpenRouter 配额耗尽 → 睡 600s 等重置（Qwen 已确认不可用）
if [ $RC -ne 0 ] && grep -qi "free-models-per-day" "$OUT"; then
  echo "[loop] $(date '+%F %T') OR quota exhausted and qwen down, sleeping 600s" >> "$PROJ/scripts/loop-runs.log"
  sleep 600
  exit 0
fi

# 3. 收尾：记录本轮退出码（Pi 自己负责更新 STATE.md/LOG.md）
echo "[loop] $(date '+%F %T') pi exit=$RC" >> "$PROJ/scripts/loop-runs.log"
exit $RC
