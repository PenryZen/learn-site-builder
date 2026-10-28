/* ============================================================
   TTS · 精读页朗读引擎（三引擎 + 自动降级）
   ------------------------------------------------------------
   1) online ：页面直连在线语音（百度翻译接口），<audio> 直接播，
               零安装、零后台、打开即用。默认引擎。
   2) browser：Web Speech API 系统语音（完全离线，音质取决于系统）
   3) proxy  ：本机 tts-proxy.py（微软 edge-tts 神经语音，音质最好，
               但需要一个后台进程；属于可选增强）

   engine = "auto" 时：代理在跑就用代理 → 否则在线 → 在线失败退系统语音。
   共同能力：逐段朗读 + 当前段高亮滚动、段间停顿、语速持久化、
   长段按句切分、翻页自动停。

   接入方式
   --------
   1. index.html 里 <script src="tts.js"></script>（放在 app 逻辑之前）
   2. 朗读按钮：
        TTS.onFail = function (msg) { toast(msg); };   // 引擎不可达时提示
        TTS.speak([{ el: 段落元素, text: 纯文本 }], function (it, done, total) {
          note.textContent = it ? done + " / " + total : "";
        });
   3. 停止 / 判定：TTS.stop()、TTS.speaking()
   4. 设置面板读 TTS.getCfg()，写 TTS.setCfg({engine:'auto'|'proxy'|'online'|'browser', rate, pvoice, voice})
   ============================================================ */
var TTS = (function () {
  "use strict";

  var synth = (typeof window !== "undefined" && window.speechSynthesis) || null;
  var CFG_KEY = "learn_tts_cfg_v1";

  var cfg = {
    engine: "auto",                    /* auto | online | browser | proxy */
    voice: "",                         /* 浏览器语音名 */
    proxy: "http://127.0.0.1:8790",    /* 代理地址 */
    pvoice: "zh-CN-XiaoxiaoNeural",    /* 神经语音名 */
    rate: 1.0,                         /* 0.6–2 */
    pitch: 1.0                         /* 0.8–1.4，仅系统/代理引擎生效 */
  };
  try {
    var saved = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
    for (var k in cfg) if (saved[k] !== undefined) cfg[k] = saved[k];
    /* v1 时代的默认值没有 auto，升级过来的人保留原选择即可 */
  } catch (e) {}

  function save() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function getCfg() { return cfg; }
  function setCfg(patch) {
    for (var k in patch) if (k in cfg) cfg[k] = patch[k];
    save();
  }

  var voice = null, chain = null;

  /* 复用 <audio> 元素池：Safari 只对「本次页面里已播过」的元素稳定放行链式续播，
     所以在线引擎用两个元素交替（A 播当前、B 预取下一段），段间几乎无缝。 */
  var POOL = [];
  function audioEl(i) {
    i = i || 0;
    if (!POOL[i]) { var a = new Audio(); a.preload = "auto"; POOL[i] = a; }
    return POOL[i];
  }

  /* 用户第一次按朗读时，在手的同步栈里解锁一次播放权限 */
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      var a = audioEl(2);   /* 专用静音元素，别占用 A/B 双缓冲的位置 */
      a.muted = true;
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
      setTimeout(function () { try { a.muted = false; } catch (e) {} }, 120);
    } catch (e) {}
  }

  /* ---------- 浏览器引擎 ---------- */
  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices() || [];
    var zh = vs.filter(function (v) { return /^zh[-_]?/i.test(v.lang); });
    if (cfg.voice) {
      var hit = zh.find(function (v) { return v.name === cfg.voice; });
      if (hit) { voice = hit; return; }
    }
    /* 增强/优质 > 常见普通话女声 > 其余；eloquence 复古音（Eddy/Flo/Grandma…）排最后 */
    var good = zh.filter(function (v) { return !/^com/i.test(v.name) && !/Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox/i.test(v.name); });
    voice = good.find(function (v) { return /Enhanced|Premium|增强|优质/i.test(v.name); }) ||
      good.find(function (v) { return /Tingting|婷婷|Meijia|美佳|Yu-?shu|语舒|Li-?mu|Sinan|Xiaoxiao/i.test(v.name); }) ||
      good.filter(function (v) { return !/zh[-_]TW|zh[-_]HK/i.test(v.lang); })[0] ||
      good[0] || zh[0] || null;
  }
  function listBrowserVoices() {
    if (!synth) return [];
    pickVoice();
    var vs = synth.getVoices() || [];
    var zh = vs.filter(function (v) { return /^zh[-_]?/i.test(v.lang); });
    function rank(v) {
      if (/Enhanced|Premium|增强|优质/i.test(v.name)) return 3;
      if (/^com/i.test(v.name) || /Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley/i.test(v.name)) return 0;
      return 1;
    }
    zh.sort(function (a, b) { return rank(b) - rank(a); });
    return zh.map(function (v) {
      var tag = rank(v) === 3 ? "（增强）" : (rank(v) === 0 ? "（复古音·不推荐）" : "");
      return { id: v.name, label: v.name.replace(/Microsoft | \(.*\)/g, "") + tag };
    });
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  /* ---------- 高品质代理引擎 ---------- */
  function proxyBase() { return (cfg.proxy || "").replace(/\/+$/, ""); }
  function listProxyVoices(cb) {
    var done = false, to = setTimeout(function () { if (!done) { done = true; cb(false, "超时"); } }, 2500);
    fetch(proxyBase() + "/voices")
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (arr) { if (!done) { done = true; clearTimeout(to); cb(true, arr); } })
      .catch(function (e) { if (!done) { done = true; clearTimeout(to); cb(false, String((e && e.message) || e)); } });
  }
  /* 开机后台探测一次，供 auto 选路；失败静默 */
  var proxyAlive = null;
  function probeProxy() {
    if (proxyAlive !== null) return Promise.resolve(proxyAlive);
    return new Promise(function (res) {
      var done = false;
      var fin = function (v) { if (!done) { done = true; proxyAlive = v; res(v); } };
      setTimeout(function () { fin(false); }, 900);
      try {
        fetch(proxyBase() + "/voices", { cache: "no-store" })
          .then(function (r) { fin(!!r.ok); })
          .catch(function () { fin(false); });
      } catch (e) { fin(false); }
    });
  }
  if (typeof window !== "undefined") setTimeout(probeProxy, 600);

  /* ---------- 在线语音（免安装） ---------- */
  /* 百度翻译的公开朗读接口：无需 key / 无需后台，GET 即可拿到 MP3。
     <audio> 播放不检查 CORS，所以不存在跨域问题。 */
  function onlineUrl(text) {
    var spd = Math.round(cfg.rate * 5);
    if (spd < 1) spd = 1; if (spd > 9) spd = 9;
    return "https://fanyi.baidu.com/gettts?lan=zh&spd=" + spd + "&source=web&text=" +
      encodeURIComponent(text);
  }

  /* ---------- 通用：文本清洗与切句 ---------- */
  function clean(t) {
    return String(t)
      .replace(/\s+/g, " ")
      .replace(/[*#>`_|~]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  function split(t, max) {
    max = max || 160;
    var parts = clean(t).split(/(?<=[。！？；!?])/);
    var out = [], buf = "";
    parts.forEach(function (s) {
      if ((buf + s).length > max && buf) { out.push(buf.trim()); buf = s; }
      else buf += s;
    });
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }
  function flatten(items, max) {
    var flat = [];
    items.forEach(function (it) {
      split(it.text, max).forEach(function (seg) { flat.push({ text: seg, el: it.el }); });
    });
    return flat;
  }
  function mark(el) {
    document.querySelectorAll(".tts-on").forEach(function (e) { e.classList.remove("tts-on"); });
    if (el) {
      el.classList.add("tts-on");
      try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
    }
  }
  function finish() {
    var p = chain && chain.onProgress; chain = null; mark(null);
    if (p) p(null, 0, 0);
  }
  var GAP = 320;   /* 段间停顿：读完一段歇一口气 */

  /* ---------- 引擎1：浏览器逐段合成 ---------- */
  function speakBrowser(items, onProgress) {
    var flat = flatten(items, 160);
    if (!flat.length) return false;
    chain = { items: flat, i: 0, cur: null, onProgress: onProgress || null, mode: "browser" };
    nextBrowser();
    return true;
  }
  function nextBrowser() {
    if (!chain || chain.mode !== "browser") return;
    if (chain.i >= chain.items.length) { finish(); return; }
    var it = chain.items[chain.i++];
    mark(it.el);
    if (chain.onProgress) chain.onProgress(it, chain.i, chain.items.length);
    setTimeout(function () {
      if (!chain || chain.mode !== "browser") return;
      var u = new SpeechSynthesisUtterance(it.text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "zh-CN";
      u.rate = cfg.rate;
      u.pitch = cfg.pitch;
      chain.cur = u;
      u.onend = function () { if (chain && chain.cur === u) nextBrowser(); };
      u.onerror = function () { if (chain && chain.cur === u) nextBrowser(); };
      synth.speak(u);
    }, chain.i > 1 ? GAP : 0);
  }

  /* ---------- 引擎2：在线语音，<audio> 直连播放 ---------- */
  var slot = 0;
  function speakOnline(items, onProgress, raw) {
    var flat = flatten(items, 96);   /* 句子切短些，首句出声更快 */
    if (!flat.length) return false;
    chain = { items: flat, i: 0, onProgress: onProgress || null, mode: "online", raw: raw || items, anyOk: false };
    slot = 0;
    unlock();
    nextOnline();
    return true;
  }
  /* 把第 i 段丢给备用元素预热，播到时即开即响 */
  function warm(i) {
    if (!chain || i >= chain.items.length) return;
    var b = audioEl(slot ? 0 : 1);
    try {
      if (!b.paused) return;             /* 别打断正在播的那一只 */
      var u = onlineUrl(chain.items[i].text);
      if (b.__url !== u) {
        b.__url = u;
        b.pause();
        b.onended = null; b.onerror = null;
        b.src = u;
        b.load();
      }
    } catch (e) {}
  }
  function nextOnline() {
    if (!chain || chain.mode !== "online") return;
    if (chain.i >= chain.items.length) { finish(); return; }
    var it = chain.items[chain.i++];
    mark(it.el);
    if (chain.onProgress) chain.onProgress(it, chain.i, chain.items.length);
    slot = slot ? 0 : 1;
    var a = audioEl(slot);
    a.onended = null; a.onerror = null;
    var u = onlineUrl(it.text);
    if (a.__url !== u) { a.__url = u; a.src = u; }   /* 预热过就直接续播 */
    a.onended = function () { if (chain && chain.mode === "online") nextOnline(); };
    a.onerror = function () { if (chain && chain.mode === "online") onOnlineErr(); };
    var p;
    try { p = a.play(); } catch (e) { onOnlineErr(); return; }
    if (p && p.then) {
      p.then(function () { if (chain && chain.mode === "online") chain.anyOk = true; })
        .catch(function () { if (chain && chain.mode === "online") onOnlineErr(); });
    }
    warm(chain.i);
  }
  function onOnlineErr() {
    if (!chain || chain.mode !== "online") return;
    /* 一句失败就跳过；整条链一句都没播成 = 网络不通，退回系统语音重播 */
    if (!chain.anyOk) {
      var raw = chain.raw, prog = chain.onProgress;
      stop();
      if (synth) {
        once("在线朗读连不上网络，已自动切到系统语音");
        speakBrowser(raw, prog);
      } else if (window.TTS && window.TTS.onFail) {
        window.TTS.onFail("在线朗读连不上网络，本机也没有可用的系统语音。");
      }
      return;
    }
    setTimeout(nextOnline, 120);
  }
  var saidOnce = {};
  function once(msg) {
    if (saidOnce[msg]) return;
    saidOnce[msg] = 1;
    if (window.TTS && window.TTS.onFail) window.TTS.onFail(msg);
  }

  /* ---------- 引擎3：代理逐段取 MP3 播放（带预取） ---------- */
  var audioCache = {};   /* url → blob URL，容量有限用后即弃 */
  function cachePut(url, blobUrl) {
    audioCache[url] = blobUrl;
    var keys = Object.keys(audioCache);
    while (keys.length > 8) { var k = keys.shift(); try { URL.revokeObjectURL(audioCache[k]); } catch (e) {} delete audioCache[k]; }
  }
  function proxyUrl(text) {
    var ratePct = Math.round((cfg.rate - 1) * 100);
    var pitchHz = Math.round((cfg.pitch - 1) * 50);
    return proxyBase() + "/tts?voice=" + encodeURIComponent(cfg.pvoice) +
      "&rate=" + encodeURIComponent((ratePct >= 0 ? "+" : "") + ratePct + "%") +
      "&pitch=" + encodeURIComponent((pitchHz >= 0 ? "+" : "") + pitchHz + "Hz") +
      "&text=" + encodeURIComponent(text);
  }
  function speakProxy(items, onProgress) {
    var flat = flatten(items, 160);
    if (!flat.length) return false;
    chain = { items: flat, i: 0, onProgress: onProgress || null, mode: "proxy", anyOk: false };
    prefetchProxy(0);
    nextProxy();
    return true;
  }
  function prefetchProxy(i) {
    if (!chain || i >= chain.items.length) return;
    var url = proxyUrl(chain.items[i].text);
    if (audioCache[url]) return;
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    }).then(function (b) { cachePut(url, URL.createObjectURL(b)); }).catch(function () {});
  }
  function nextProxy() {
    if (!chain || chain.mode !== "proxy") return;
    if (chain.i >= chain.items.length) { finish(); return; }
    var it = chain.items[chain.i++];
    mark(it.el);
    if (chain.onProgress) chain.onProgress(it, chain.i, chain.items.length);
    var url = proxyUrl(it.text);
    var start = function () {
      if (!chain || chain.mode !== "proxy") return;
      chain.anyOk = true;
      var a = audioEl();
      a.onended = null; a.onerror = null;
      a.src = audioCache[url] || url;
      a.onended = function () { if (chain && chain.mode === "proxy") nextProxy(); };
      a.onerror = function () { if (chain && chain.mode === "proxy") nextProxy(); };
      var p = a.play();
      if (p && p.catch) p.catch(function () { if (chain && chain.mode === "proxy") nextProxy(); });
    };
    if (audioCache[url]) { start(); return; }
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    }).then(function (b) { cachePut(url, URL.createObjectURL(b)); start(); })
      .catch(function () {
        if (chain && chain.mode === "proxy" && !chain.anyOk) {
          once("连不上高品质朗读代理，已改用在线语音");
          var raw = chain.items.map(function (x) { return { text: x.text, el: x.el }; });
          stop();
          speakOnline(raw, null, raw);
          return;
        }
        if (chain && chain.mode === "proxy") nextProxy();
      });
    prefetchProxy(chain.i);
  }

  /* ---------- 对外接口 ---------- */
  function ok() { return !!(synth || true); }   /* 在线引擎在，永远可用 */
  function stop() {
    chain = null;
    if (synth) { try { synth.cancel(); } catch (e) {} }
    POOL.forEach(function (a) {
      try {
        a.pause(); a.onended = null; a.onerror = null;
        a.__url = null;                    /* 下次同段重读要重新装载，否则会从暂停处接 */
        a.removeAttribute("src");
      } catch (e) {}
    });
    mark(null);
  }
  function speaking() {
    if (chain) return true;
    return !!(synth && synth.speaking);
  }
  /* 实际使用的引擎：auto 走「代理 > 在线」 */
  function activeEngine() {
    var e = cfg.engine;
    if (e === "proxy") return "proxy";
    if (e === "online") return "online";
    if (e === "browser") return "browser";
    return proxyAlive ? "proxy" : "online";
  }
  function speak(items, onProgress) {
    stop();
    var e = activeEngine();
    if (e === "proxy") return speakProxy(items, onProgress);
    if (e === "online") return speakOnline(items, onProgress, items);
    if (!synth) return false;
    return speakBrowser(items, onProgress);
  }

  return {
    ok: ok, speak: speak, stop: stop, speaking: speaking,
    getCfg: getCfg, setCfg: setCfg,
    activeEngine: activeEngine, probeProxy: probeProxy,
    listBrowserVoices: listBrowserVoices, listProxyVoices: listProxyVoices,
    onFail: null   /* 引擎不可达时的回调，app.js 里接 toast */
  };
})();
