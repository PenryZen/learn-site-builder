#!/bin/bash
# ============================================================
# 朗读神经语音 · 一键装成系统服务（macOS）
# ------------------------------------------------------------
# 双击本文件一次：把同目录的 tts-proxy.py 装成开机自启的后台服务。
# 装好之后：无窗口、不用手动启动、开机自动运行、崩了自动重启。
#
# 移除：
#   launchctl bootout gui/$UID/local.learn-tts
#   rm ~/Library/LaunchAgents/local.learn-tts.plist
# ============================================================
set -u

LABEL="local.learn-tts"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")" && pwd)"

# ---- 找一个装了 edge-tts 的 python ----
pick_py() {
  for c in \
    "$HOME/.workbuddy/binaries/python/envs/default/bin/python3" \
    "/opt/homebrew/bin/python3" \
    "/usr/local/bin/python3" \
    "$(command -v python3 2>/dev/null)"; do
    if [ -n "$c" ] && [ -x "$c" ] && "$c" -c "import edge_tts" 2>/dev/null; then
      echo "$c"; return 0
    fi
  done
  return 1
}

PY="$(pick_py)" || {
  echo "没找到装了 edge-tts 的 python。先装依赖再双击本文件："
  echo "  python3 -m pip install edge-tts"
  read -r -p "按回车关闭…" _; exit 1
}
echo "python：$PY"
echo "项目目录：$DIR"
echo

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>$DIR/tts-proxy.py</string>
    <string>--port</string><string>8790</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/tmp/learn-tts.out.log</string>
  <key>StandardErrorPath</key><string>/tmp/learn-tts.err.log</string>
</dict>
</plist>
PLISTEOF

pkill -f "tts-proxy.py --port 8790" 2>/dev/null
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null
sleep 0.6

if launchctl bootstrap "gui/$UID" "$PLIST" 2>/dev/null; then
  echo "✅ 已装成系统服务（开机自启、无窗口）"
else
  echo "⚠ 系统服务注册失败，退回普通后台进程（重启后需再点一次）"
  ( nohup "$PY" "$DIR/tts-proxy.py" --port 8790 >/tmp/learn-tts.out.log 2>&1 & )
fi

sleep 2
CODE=$(curl -s -m 4 -o /dev/null -w "%{http_code}" http://127.0.0.1:8790/voices)
if [ "$CODE" = "200" ]; then
  echo "✅ 服务已在线：http://127.0.0.1:8790"
  echo
  echo "现在关掉这个窗口即可，以后开机自动运行。"
else
  echo "✗ 服务没起来（HTTP $CODE），看日志：/tmp/learn-tts.err.log"
fi
echo
read -r -p "按回车关闭本窗口…" _
