/* ============================================================
   viz-core.js — 图示引擎（纯工具，无依赖）
   给学习站的交互图提供 SVG / Canvas 公共工具与注册表。
   视觉语言：深空底 + 象牙白钢笔线 + 光谱高亮（一套色，别自造）。
   用法：
     VZ.define({ "f-x": { title, hint, legend, draw: function(stage){...} } });
     VZ.fig("f-x", host);        // host 通常是 <div class="figbox">
   细则见 references/interactive-figures.md
   ============================================================ */
var VZ = (function () {
  var NS = "http://www.w3.org/2000/svg";

  /* ---------- 视觉规范（所有图必须使用这里的颜色） ---------- */
  var C = {
    ink:    "#f2ecdf",   /* 主线条：象牙白，模仿手绘钢笔 */
    ink2:   "#c9c2e6",   /* 次级线条 */
    dim:    "#8d86bd",   /* 弱化文字 */
    faint:  "#4b4380",   /* 网格、辅助线 */
    cyan:   "#4fe3f0",
    mag:    "#ff6fd8",
    gold:   "#ffcf5c",
    green:  "#5ee08a",
    red:    "#ff7a7a",
    violet: "#9b8cff",
    blue:   "#6aa8ff",
    deep:   "#100c24",   /* 图内底色，与 .fig-svg 的 background 一致 */
    panel:  "#1c1440",
    line:   "#3a2b7a"
  };

  /* ---------- 基础构造 ---------- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  /* 响应式 SVG 画布：viewBox 固定，宽度撑满父容器 */
  function S(host, w, h, opts) {
    opts = opts || {};
    var svg = el("svg", {
      viewBox: "0 0 " + w + " " + h,
      class: "fig-svg" + (opts.cls ? " " + opts.cls : ""),
      preserveAspectRatio: "xMidYMid meet",
      role: "img"
    });
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
    var bg = el("rect", { x: 0, y: 0, width: w, height: h, rx: 12, fill: opts.bg || C.deep }, svg);
    if (opts.grid) {
      var gd = el("defs", null, svg);
      var pt = el("pattern", { id: "vg" + Math.random().toString(36).slice(2, 8), width: 26, height: 26, patternUnits: "userSpaceOnUse" }, gd);
      el("path", { d: "M26 0H0V26", fill: "none", stroke: C.faint, "stroke-width": .6, opacity: .45 }, pt);
      el("rect", { x: 0, y: 0, width: w, height: h, fill: "url(#" + pt.id + ")", rx: 12 }, svg);
    }
    if (host) host.appendChild(svg);
    return svg;
  }

  function g(parent, attrs) { return el("g", attrs || {}, parent); }
  function ln(parent, x1, y1, x2, y2, a) { a = a || {}; a.x1 = x1; a.y1 = y1; a.x2 = x2; a.y2 = y2; return el("line", fill0(a), parent); }
  function circ(parent, cx, cy, r, a) { a = a || {}; a.cx = cx; a.cy = cy; a.r = r; return el("circle", fill0(a), parent); }
  function path(parent, d, a) { a = a || {}; a.d = d; a.fill = a.fill || "none"; return el("path", a, parent); }
  function poly(parent, pts, a) { a = a || {}; a.points = pts; a.fill = a.fill || "none"; return el("path", attrPoints(pts, a), parent); }
  function txt(parent, x, y, s, a) {
    a = a || {};
    a.x = x; a.y = y; a.fill = a.fill || C.ink;
    if (a.size) { a["font-size"] = a.size; delete a.size; }
    if (!a["font-family"]) a["font-family"] = 'Georgia,"Songti SC","PingFang SC",serif';
    if (a.anchor) { a["text-anchor"] = a.anchor; delete a.anchor; }
    if (a.weight) { a["font-weight"] = a.weight; delete a.weight; }
    a.text = s;
    return el("text", a, parent);
  }
  function attrPoints(pts, a) {
    a.d = "M" + pts.map(function (p) { return p[0] + " " + p[1]; }).join("L") + (a.close ? "Z" : "");
    delete a.close;
    return a;
  }
  function fill0(a) {
    if (a.fill === undefined) a.fill = "none";
    if (a.stroke === undefined) a.stroke = "none";
    return a;
  }
  /* 钢笔线：统一线宽与圆头，保证“手绘感”一致 */
  function stroke(a) {
    a = a || {};
    a.fill = a.fill || "none";
    if (!a["stroke-width"]) a["stroke-width"] = 1.7;
    a["stroke-linecap"] = "round";
    a["stroke-linejoin"] = "round";
    return a;
  }

  /* 箭头（末端三角），d 为路径描述 */
  function arrowDef(svg, id, color) {
    var defs = svg.querySelector("defs") || el("defs", null, svg);
    var m = el("marker", {
      id: id, viewBox: "0 0 10 10", refX: 8, refY: 5,
      markerWidth: 5.5, markerHeight: 5.5, orient: "auto-start-reverse"
    }, defs);
    el("path", { d: "M0 1L9 5L0 9z", fill: color || C.ink }, m);
    return "url(#" + id + ")";
  }
  function grad(svg, id, stops, vertical) {
    var defs = svg.querySelector("defs") || el("defs", null, svg);
    var lg = el("linearGradient", { id: id, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0 }, defs);
    stops.forEach(function (s) { el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] === undefined ? 1 : s[2] }, lg); });
    return "url(#" + id + ")";
  }
  function blurFilter(svg, id, dev) {
    var defs = svg.querySelector("defs") || el("defs", null, svg);
    var f = el("filter", { id: id, x: "-60%", y: "-60%", width: "220%", height: "220%" }, defs);
    el("feGaussianBlur", { stdDeviation: dev || 4 }, f);
    return "url(#" + id + ")";
  }
  function clipCircle(svg, id, cx, cy, r) {
    var defs = svg.querySelector("defs") || el("defs", null, svg);
    var cp = el("clipPath", { id: id }, defs);
    el("circle", { cx: cx, cy: cy, r: r }, cp);
    return "url(#" + id + ")";
  }
  function uid(prefix) { return (prefix || "v") + Math.random().toString(36).slice(2, 9); }

  /* ---------- 动画 ---------- */
  /* 绑定到宿主的动画循环：宿主被移出文档时自动停止，无需手动清理 */
  function raf(host, fn) {
    var alive = true;
    var t0 = performance.now();
    function step(now) {
      if (!alive || !host.isConnected) { alive = false; return; }
      try { fn((now - t0) / 1000, now - t0); } catch (e) { /* 单帧错误不中断 */ }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    return function () { alive = false; };
  }
  /* 一根线“画出来”的入场动画 */
  function drawIn(p, dur, delay) {
    var len = 0;
    try { len = p.getTotalLength(); } catch (e) { return; }
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    p.style.transition = "stroke-dashoffset " + (dur || .9) + "s cubic-bezier(.4,0,.2,1) " + (delay || 0) + "s";
    requestAnimationFrame(function () { requestAnimationFrame(function () { p.style.strokeDashoffset = 0; }); });
  }
  /* 大面积入场：为子元素加错峰出现 */
  function stagger(host, sel, ms) {
    var items = host.querySelectorAll(sel);
    Array.prototype.forEach.call(items, function (el2, i) {
      el2.style.opacity = 0;
      el2.style.transform = "translateY(8px)";
      el2.style.transition = "opacity .5s ease " + (i * (ms || 55)) + "ms, transform .5s cubic-bezier(.3,0,.2,1) " + (i * (ms || 55)) + "ms";
      requestAnimationFrame(function () { requestAnimationFrame(function () { el2.style.opacity = 1; el2.style.transform = "none"; }); });
    });
  }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- 交互 ---------- */
  /* 把鼠标/触摸位置换算成 SVG viewBox 坐标 */
  function toSvg(svg, ev, w, h) {
    var r = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    return {
      x: ((ev.clientX - r.left) / r.width) * vb.width + vb.x,
      y: ((ev.clientY - r.top) / r.height) * vb.height + vb.y
    };
  }
  /* 拖拽点：onDrag(x,y,phase) 接收 viewBox 坐标 */
  function drag(svg, hit, w, h, onDrag) {
    function down(e) {
      e.preventDefault();
      var moving = true;
      var p0 = toSvg(svg, e, w, h);
      onDrag(p0.x, p0.y, "start", e);
      function move(ev2) { if (!moving) return; var p = toSvg(svg, ev2, w, h); onDrag(p.x, p.y, "move", ev2); }
      function up(ev2) { if (!moving) return; moving = false; var p = toSvg(svg, ev2, w, h); onDrag(p.x, p.y, "end", ev2);
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }
    hit.addEventListener("pointerdown", down);
    hit.style.cursor = "grab";
    return function () { hit.removeEventListener("pointerdown", down); };
  }
  function onDragRange(svg, hit, onMove) {
    hit.addEventListener("pointerdown", function (e) {
      e.preventDefault(); hit.setPointerCapture && hit.setPointerCapture(e.pointerId);
      var mv = function (ev) { var p = toSvg(svg, ev); onMove(p.x, p.y); };
      var up = function () { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
      onMove(toSvg(svg, e).x, toSvg(svg, e).y);
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    });
    hit.style.cursor = "grab";
  }

  /* 沿路径运动的光点：用于表现“推导链”“循环”“信号传播” */
  function travel(svg, d, opts) {
    opts = opts || {};
    var host = document.createElementNS(NS, "g");
    svg.appendChild(host);
    var p = path(host, d, { stroke: "none", fill: "none" });
    var len = 0;
    try { len = p.getTotalLength(); } catch (e) { return function () {}; }
    var n = opts.count || 1;
    var dots = [];
    for (var i = 0; i < n; i++) {
      dots.push(circ(host, -99, -99, opts.r || 4.5, { fill: opts.color || C.cyan }));
    }
    var dur = opts.dur || 2.4, delay = opts.delay || 0, alive = true;
    raf(svg, function (t) {
      if (!alive) return;
      var span = dur + delay;
      for (var i = 0; i < dots.length; i++) {
        var ph = ((t + delay - i * span / n) % span + span) % span;
        if (ph > dur) { dots[i].setAttribute("opacity", 0); continue; }
        var u = ease(ph / dur);
        var pt = p.getPointAtLength(u * len);
        dots[i].setAttribute("opacity", opts.fade === false ? 1 : Math.sin(Math.PI * u) * 0.9 + 0.1);
        dots[i].setAttribute("cx", pt.x);
        dots[i].setAttribute("cy", pt.y);
      }
    });
    return function () { alive = false; host.remove(); };
  }

  /* ---------- HTML 控件 ---------- */
  function box(host, cls) { var d = document.createElement("div"); d.className = cls || "viz-ctl"; host.appendChild(d); return d; }
  function slider(host, cfg) {
    var wrap = document.createElement("label");
    wrap.className = "viz-slider";
    var top = document.createElement("span");
    top.className = "viz-slider-top";
    var name = document.createElement("b"); name.textContent = cfg.label || "";
    var val = document.createElement("i"); val.textContent = cfg.format ? cfg.format(cfg.value) : cfg.value;
    top.appendChild(name); top.appendChild(val);
    var inp = document.createElement("input");
    inp.type = "range"; inp.min = cfg.min; inp.max = cfg.max; inp.step = cfg.step || 0.01; inp.value = cfg.value;
    inp.oninput = function () {
      var v = parseFloat(inp.value);
      val.textContent = cfg.format ? cfg.format(v) : v;
      cfg.onInput(v);
    };
    wrap.appendChild(top); wrap.appendChild(inp);
    host.appendChild(wrap);
    return { input: inp, set: function (v) { inp.value = v; val.textContent = cfg.format ? cfg.format(v) : v; }, readout: val };
  }
  function btn(host, label, on, cls) {
    var b = document.createElement("button");
    b.className = "viz-btn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.onclick = on;
    host.appendChild(b);
    return b;
  }
  function chips(host, items, active, onPick) {
    var wrap = document.createElement("div");
    wrap.className = "viz-chips";
    items.forEach(function (it) {
      var b = document.createElement("button");
      b.className = "viz-chip" + (it === active ? " on" : "");
      b.textContent = it;
      b.onclick = function () {
        wrap.querySelectorAll(".viz-chip").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        onPick(it);
      };
      wrap.appendChild(b);
    });
    host.appendChild(wrap);
    return wrap;
  }
  function legend(host, items) {
    var wrap = document.createElement("div");
    wrap.className = "viz-legend";
    items.forEach(function (it) {
      var s = document.createElement("span");
      var i = document.createElement("i");
      i.style.background = it[1];
      /* 线段型图例：不能靠 border-top——全局 box-sizing:border-box 下 height:0 会把边框整个裁掉，
         图例只剩文字、没有色条。直接用一条 3px 高的实心块。 */
      if (it[2] === "line") { i.style.background = it[1]; i.style.height = "3px"; i.style.borderRadius = "2px"; i.style.verticalAlign = "middle"; }
      s.appendChild(i);
      s.appendChild(document.createTextNode(it[0]));
      wrap.appendChild(s);
    });
    host.appendChild(wrap);
    return wrap;
  }
  function note(host, text) {
    var d = document.createElement("div");
    d.className = "viz-note";
    d.innerHTML = text;
    host.appendChild(d);
    return d;
  }
  function readout(host) {
    var d = document.createElement("div");
    d.className = "viz-readout";
    host.appendChild(d);
    return d;
  }
  /* 数值面板：{[标签]:值} */
  function panel(host, pairs, cls) {
    var d = document.createElement("div");
    d.className = "viz-panel" + (cls ? " " + cls : "");
    for (var k in pairs) {
      var row = document.createElement("div");
      row.className = "viz-panel-row";
      row.innerHTML = '<span>' + k + '</span><b>' + pairs[k] + "</b>";
      d.appendChild(row);
    }
    host.appendChild(d);
    return d;
  }
  function setPanel(d, pairs) {
    for (var k in pairs) {
      var found = null;
      Array.prototype.forEach.call(d.children, function (r) { if (r.firstChild.textContent === k) found = r; });
      if (found) found.lastChild.textContent = pairs[k];
    }
  }

  /* SVG 内的中文段落自动折行（按“汉字宽=1、西文宽≈0.55”估算） */
  function para(parent, x, y, str, o) {
    o = o || {};
    var size = o.size || 13;
    var per = o.per || 20, lh = o.lh || size * 1.62;
    var lines = [];
    String(str).split("\n").forEach(function (seg) {
      if (!seg) { lines.push(""); return; }
      var cur = "", w = 0;
      for (var i = 0; i < seg.length; i++) {
        var ch = seg[i], cw = /[\x00-\xff]/.test(ch) ? 0.56 : 1;
        if (w + cw > per) { lines.push(cur); cur = ch; w = cw; } else { cur += ch; w += cw; }
      }
      if (cur) lines.push(cur);
    });
    lines.forEach(function (l, i) {
      txt(parent, x, y + i * lh, l, { size: size, fill: o.fill || C.ink2, anchor: o.anchor, weight: o.weight });
    });
    return lines.length * lh;
  }
  /* 圆角卡片块 */
  function card(parent, x, y, w, h, o) {
    o = o || {};
    el("rect", {
      x: x, y: y, width: w, height: h, rx: o.rx === undefined ? 10 : o.rx,
      fill: o.fill || "rgba(255,255,255,.035)",
      stroke: o.stroke || C.faint, "stroke-width": o.sw || 1
    }, parent);
  }

  /* ---------- 双曲几何小工具 ---------- */

  /* 双曲极坐标 → 庞加莱圆盘笛卡尔坐标（rho 为到中心的测地距离） */
  function poincare(rho, theta, R) { R = R || 1; var r = Math.tanh(rho / 2) * R; return [r * Math.cos(theta), r * Math.sin(theta)]; }
  /* 双曲距离（庞加莱圆盘，半径 R） */
  function hyperDist(a, b, R) {
    R = R || 1;
    var num = Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2);
    var da = (R * R - a[0] * a[0] - a[1] * a[1]) / (R * R);
    var db = (R * R - b[0] * b[0] - b[1] * b[1]) / (R * R);
    return Math.acosh(1 + 2 * num / (R * R * da * db));
  }
  /* 过圆盘内两点的测地线：返回 SVG 弧线描述 */
  function geoArc(p1, p2, R) {
    R = R || 1;
    var x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    var det = x1 * y2 - x2 * y1;
    if (Math.abs(det) < 1e-7) return { d: "M" + x1 + " " + y1 + "L" + x2 + " " + y2, straight: true };
    var b1 = (R * R + x1 * x1 + y1 * y1) / 2, b2 = (R * R + x2 * x2 + y2 * y2) / 2;
    var cx = (b1 * y2 - b2 * y1) / det, cy = (x1 * b2 - x2 * b1) / det;
    var r = Math.hypot(x1 - cx, y1 - cy);
    var a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
    var d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    var midShort = a1 + d / 2;
    var pShort = [cx + r * Math.cos(midShort), cy + r * Math.sin(midShort)];
    var pLong = [cx - r * Math.cos(midShort), cy - r * Math.sin(midShort)];
    var shortIn = Math.hypot(pShort[0], pShort[1]) < R * 0.999;
    var large = shortIn ? 0 : 1;
    var sweep = shortIn ? (d > 0 ? 1 : 0) : (d > 0 ? 0 : 1);
    return { d: "M" + x1 + " " + y1 + "A" + r + " " + r + " 0 " + large + " " + sweep + " " + x2 + " " + y2, r: r, c: [cx, cy], large: large, sweep: sweep };
  }
  /* 双曲正则 {p,q} 镶嵌的外接半径（测地距离） */
  function hyperCircum(p, q) {
    var PI = Math.PI;
    var coshA = (Math.cos(2 * PI / p) + Math.pow(Math.cos(PI / q), 2)) / Math.pow(Math.sin(PI / q), 2);
    var shA = Math.sqrt(Math.max(coshA * coshA - 1, 0));
    var sinhRho = shA * Math.sin(PI / q) / Math.sin(2 * PI / p);
    return Math.asinh(sinhRho);
  }
  /* 三角形内角和（双曲、给定顶点） */
  function hyperTriangleAngles(a, b, c, R) {
    /* 双曲余弦定理：cosh(对边) = cosh(邻1)·cosh(邻2) − sinh(邻1)·sinh(邻2)·cos(顶角)
       A 是顶点 a 处的角，对边为 |bc|；其余对称。 */
    var la = hyperDist(b, c, R), lb = hyperDist(a, c, R), lc = hyperDist(a, b, R);
    var A = Math.acos(clamp((Math.cosh(lb) * Math.cosh(lc) - Math.cosh(la)) /
      (Math.sinh(lb) * Math.sinh(lc)), -1, 1));
    var B = Math.acos(clamp((Math.cosh(la) * Math.cosh(lc) - Math.cosh(lb)) /
      (Math.sinh(la) * Math.sinh(lc)), -1, 1));
    var C = Math.acos(clamp((Math.cosh(la) * Math.cosh(lb) - Math.cosh(lc)) /
      (Math.sinh(la) * Math.sinh(lb)), -1, 1));
    return [A, B, C];
  }

  /* 高 DPI Canvas 画布
     opts.maxDpr    限制像素密度（默认 2）
     opts.maxPixels 限制后备缓冲区像素总数——逐像素算的图（曼德博这类）必须给，
                    否则 retina 上是 4 倍开销，点一下要等好几秒。
     返回的 bw/bh 是后备缓冲区的真实像素数：putImageData 不认 ctx 的缩放变换，
     逐像素写图必须按 bw/bh 来，否则只画出左上角一小块。 */
  function canvas(host, w, h, opts) {
    opts = opts || {};
    var cv = document.createElement("canvas");
    var dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
    if (opts.maxPixels && w * h * dpr * dpr > opts.maxPixels) {
      dpr = Math.max(1, Math.sqrt(opts.maxPixels / (w * h)));
    }
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = "100%";
    cv.style.maxWidth = w + "px";
    cv.style.aspectRatio = w + " / " + h;
    cv.style.display = "block";
    cv.style.borderRadius = "12px";
    cv.style.background = C.deep;
    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    host.appendChild(cv);
    return { cv: cv, ctx: ctx, w: w, h: h, dpr: dpr, bw: cv.width, bh: cv.height };
  }

  /* ---------- 注册表 ---------- */
  var REG = {};
  function define(map) { for (var k in map) REG[k] = map[k]; }
  function fig(id, host) {
    var f = REG[id];
    if (!f) {
      var miss = document.createElement("div");
      miss.className = "viz-missing";
      miss.textContent = "图示缺失：" + id;
      host.appendChild(miss);
      return false;
    }
    host.innerHTML = "";
    if (f.title) {
      var title = document.createElement("div");
      title.className = "fig-title";
      title.textContent = f.title;
      host.appendChild(title);
    }
    var stage = document.createElement("div");
    stage.className = "fig-stage";
    host.appendChild(stage);
    try { f.draw(stage, f); }
    catch (e) {
      stage.innerHTML = '<div class="viz-missing">图示渲染出错：' + id + " — " + e.message + "</div>";
      if (window.console) console.warn("[viz]", id, e);
    }
    if (f.legend) VZ.legend(stage, f.legend);
    if (f.hint) VZ.note(stage, f.hint);
    return true;
  }
  function has(id) { return !!REG[id]; }
  function ids() { return Object.keys(REG); }

  return {
    C: C, el: el, S: S, g: g, ln: ln, circ: circ, path: path, poly: poly, txt: txt, stroke: stroke,
    arrowDef: arrowDef, grad: grad, blurFilter: blurFilter, clipCircle: clipCircle, uid: uid, para: para, card: card,
    raf: raf, drawIn: drawIn, stagger: stagger, ease: ease, clamp: clamp, lerp: lerp, travel: travel,
    toSvg: toSvg, drag: drag, onDragRange: onDragRange,
    box: box, slider: slider, btn: btn, chips: chips, legend: legend, note: note,
    canvas: canvas,
    readout: readout, panel: panel, setPanel: setPanel,
    poincare: poincare, geoArc: geoArc, hyperDist: hyperDist, hyperCircum: hyperCircum,
    hyperTriangleAngles: hyperTriangleAngles,
    define: define, fig: fig, has: has, ids: ids, REG: REG
  };
})();
