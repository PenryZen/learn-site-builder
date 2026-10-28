#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tts-proxy.py · 学习站的高品质朗读代理（微软 Edge 神经语音）
==========================================================

浏览器自带的 speechSynthesis 语音（macOS 婷婷、Windows Huihui…）偏机械。
本代理接入微软 Edge 神经语音（晓晓、云希等，自然度接近真人），网页端
「朗读」切到 proxy 引擎后，音频由这里实时合成并回传 MP3。

为什么需要它：Edge 的 TTS WebSocket 接口强制要求 Sec-MS-GEC 自定义请求头，
而浏览器规范禁止脚本给 WebSocket 设自定义头 —— 页面无法直连，必须本机代理。

依赖：pip install edge-tts（联网到微软语音服务）

用法
----
    python3 tts-proxy.py            # 默认端口 8790
    python3 tts-proxy.py --port 8791

然后回到网页：朗读工具条 → ⚙ → 引擎选「auto」或「proxy」。

接口
----
    GET /voices                    → [{"id": "zh-CN-XiaoxiaoNeural", "label": "晓晓·女"}, ...]
    GET /tts?text=...&voice=...&rate=+10%&pitch=+2Hz → audio/mpeg
"""

import argparse
import asyncio
import json
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import edge_tts
except ImportError:
    sys.exit("缺少依赖：先运行  pip install edge-tts")

PORT = 8790

# 常用中文语音（label 标注性别与特色，方便挑选）
VOICES = [
    {"id": "zh-CN-XiaoxiaoNeural",  "label": "晓晓 · 女 · 自然亲和（推荐）"},
    {"id": "zh-CN-XiaoyiNeural",    "label": "晓伊 · 女 · 温柔"},
    {"id": "zh-CN-YunxiNeural",     "label": "云希 · 男 · 年轻清亮"},
    {"id": "zh-CN-YunyangNeural",   "label": "云扬 · 男 · 新闻播音风"},
    {"id": "zh-CN-YunjianNeural",   "label": "云健 · 男 · 沉稳磁性"},
    {"id": "zh-CN-liaoning-XiaobeiNeural", "label": "晓北 · 女 · 东北口音"},
    {"id": "zh-TW-HsiaoChenNeural", "label": "曉臻 · 女 · 台湾腔"},
    {"id": "zh-HK-HiuMaanNeural",   "label": "曉曼 · 女 · 粤语"},
]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # 安静运行

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _reply(self, code, body, ctype):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/voices":
            self._reply(200, json.dumps(VOICES, ensure_ascii=False).encode("utf-8"),
                        "application/json; charset=utf-8")
            return
        if u.path != "/tts":
            self._reply(404, b'{"error":"not found"}', "application/json")
            return
        q = urllib.parse.parse_qs(u.query)
        text = (q.get("text", [""])[0] or "").strip()
        if not text:
            self._reply(400, b'{"error":"text required"}', "application/json")
            return
        voice = q.get("voice", ["zh-CN-XiaoxiaoNeural"])[0]
        rate = q.get("rate", ["+0%"])[0]
        pitch = q.get("pitch", ["+0Hz"])[0]

        async def synth():
            buf = bytearray()
            com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
            async for chunk in com.stream():
                if chunk["type"] == "audio":
                    buf.extend(chunk["data"])
            return bytes(buf)

        try:
            data = asyncio.run(synth())
        except Exception as e:  # 网络抖动、语音名无效等
            msg = json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")
            self._reply(502, msg, "application/json; charset=utf-8")
            return
        if not data:
            self._reply(502, b'{"error":"empty audio"}', "application/json")
            return
        self._reply(200, data, "audio/mpeg")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=PORT)
    args = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("高品质朗读代理已启动：http://127.0.0.1:%d  （Ctrl+C 退出）" % args.port)
    print("网页端：精读页朗读工具条 → ⚙ → 引擎选「高品质语音（代理）」")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出")


if __name__ == "__main__":
    main()
