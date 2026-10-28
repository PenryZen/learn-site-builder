/* viz-demo.js — 脚手架自带的一张示例交互图
   它同时演示三件事：
   1) VZ.define 注册一张图，VZ.fig 挂到 .figbox；
   2) 滑杆 / 预设按钮驱动重绘（不需要重画整张图，只改 d 与读数）；
   3) 窄屏换版面（stage 宽度 < 560 时用更小的 viewBox，否则字会缩到看不清）。
   想加自己的图：复制这一条，改 id / title / hint / draw 即可。
   细则见 references/interactive-figures.md */

VZ.define({

"f-demo-forget": {
  title: "间隔复习：把遗忘曲线咬成锯齿",
  hint: "拖滑杆改复习间隔。<b>每个复习点都把记忆拉回 100%</b>，而且越往后掉得越慢——稳定性在涨。看两个数打架：间隔拉长，「复习次数」降下来，但「谷底」也往下掉（两次复习之间真的会忘）；间隔压到 1 天，谷底很高却要复 30 次。最优点落在你「刚好快忘」的那一天。",
  legend: [["不复习", VZ.C.red, "line"], ["按间隔复习", VZ.C.cyan, "line"], ["复习点", VZ.C.gold]],
  draw: function (stage) {
    var C = VZ.C;
    /* 窄屏：760 宽的图在 330px 容器里会缩到 43%，字全糊。换成更小的 viewBox。 */
    var NARROW = stage.clientWidth > 0 && stage.clientWidth < 560;
    var W = NARROW ? 380 : 720, H = NARROW ? 300 : 320;
    var padL = NARROW ? 36 : 46, padR = NARROW ? 14 : 22;
    var padT = 18, padB = NARROW ? 32 : 38;
    var DAYS = 30, S0 = 2.2, G = 1.9;      /* S0 初始稳定性（天），G 每次复习的增益 */
    var S = { interval: 3 };

    var svg = VZ.S(stage, W, H, {});

    function xOf(t) { return padL + (W - padL - padR) * t / DAYS; }
    function yOf(v) { return padT + (H - padT - padB) * (1 - v / 100); }
    function reviewsFor(i) {
      var n = Math.floor(DAYS / i + 1e-9), out = [], k;
      for (k = 1; k <= n; k++) out.push(k * i);
      return out;
    }
    /* 保持率：最后一次复习之后按 exp 衰减，稳定性 = S0 · G^复习次数 */
    function keep(t, times) {
      var s = S0, last = 0, i;
      for (i = 0; i < times.length; i++) { if (times[i] <= t + 1e-9) { s *= G; last = times[i]; } }
      return 100 * Math.exp(-(t - last) / s);
    }

    /* ---------- 坐标与网格 ---------- */
    var g, v, y, d;
    for (g = 0; g <= 4; g++) {
      v = g * 25; y = yOf(v);
      VZ.ln(svg, padL, y, W - padR, y, { stroke: C.faint, "stroke-width": 0.8, opacity: g === 0 ? 0.9 : 0.38 });
      if (g % 2 === 0) VZ.txt(svg, padL - 7, y + 3.5, v + "%", { size: 9.5, fill: C.dim, anchor: "end" });
    }
    var step = NARROW ? 10 : 5;
    for (d = 0; d <= DAYS; d += step) {
      VZ.txt(svg, xOf(d), H - padB + 15, d + (d === DAYS ? " 天" : ""), { size: 9.5, fill: C.dim, anchor: "middle" });
    }
    VZ.txt(svg, padL, padT - 5, "记忆保持率", { size: 9.5, fill: C.dim });

    var base = VZ.path(svg, "", VZ.stroke({ stroke: C.red, "stroke-width": 1.6, "stroke-dasharray": "5 4", opacity: 0.7 }));
    var curve = VZ.path(svg, "", VZ.stroke({ stroke: C.cyan, "stroke-width": 2.4 }));
    var dots = [];
    for (g = 0; g < 20; g++) {
      dots.push(VZ.circ(svg, -99, -99, NARROW ? 3.2 : 3.8, { fill: C.gold, stroke: C.deep, "stroke-width": 1.1, display: "none" }));
    }

    /* ---------- 控件 ---------- */
    var slides = document.createElement("div");
    slides.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 18px;margin-top:2px";
    stage.appendChild(slides);
    var sI = VZ.slider(slides, {
      label: "复习间隔", min: 0.5, max: 10, step: 0.5, value: S.interval,
      format: function (x) { return x + " 天"; },
      onInput: function (x) {
        S.interval = x;
        presetRow.querySelectorAll(".viz-chip").forEach(function (b) { b.classList.remove("on"); });
        sync();
      }
    });
    var presetRow = document.createElement("div");
    presetRow.className = "viz-chips";
    presetRow.style.marginTop = "2px";
    stage.appendChild(presetRow);
    [[1, "每天"], [2, "每 2 天"], [3, "每 3 天"], [7, "每周"]].forEach(function (p) {
      var b = document.createElement("button");
      b.className = "viz-chip" + (p[0] === S.interval ? " on" : "");
      b.textContent = p[1] + "（" + Math.floor(DAYS / p[0]) + " 次）";
      b.onclick = function () {
        presetRow.querySelectorAll(".viz-chip").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        S.interval = p[0]; sI.set(p[0]); sync();
      };
      presetRow.appendChild(b);
    });

    var pan = VZ.panel(stage, {
      "复习间隔": "", "30 天内复习次数": "", "谷底（不复习）": "",
      "谷底（按间隔）": "", "平均（按间隔）": ""
    });

    /* ---------- 重绘 ---------- */
    function redraw() {
      var times = reviewsFor(S.interval), i, t, d1 = "", d2 = "";
      for (t = 0; t <= DAYS + 1e-9; t += 0.25) {
        d1 += (t ? "L" : "M") + xOf(t).toFixed(1) + " " + yOf(100 * Math.exp(-t / S0)).toFixed(1);
      }
      base.setAttribute("d", d1);
      for (t = 0; t <= DAYS + 1e-9; t += 0.1) {
        d2 += (t ? "L" : "M") + xOf(t).toFixed(1) + " " + yOf(keep(t, times)).toFixed(1);
      }
      curve.setAttribute("d", d2);
      for (i = 0; i < dots.length; i++) {
        if (i < times.length) {
          dots[i].setAttribute("cx", xOf(times[i]));
          dots[i].setAttribute("cy", yOf(98.5));
          dots[i].setAttribute("display", "");
        } else {
          dots[i].setAttribute("display", "none");
        }
      }
    }
    /* 谷底 = 每次复习前掉到的最低点（复习当天又回到 100，读「第 30 天」会误以为没忘） */
    function trough(times) {
      if (!times.length) return keep(DAYS, times);
      var low = 100, i;
      for (i = 0; i < times.length; i++) {
        low = Math.min(low, keep(times[i] - 0.01, times));
      }
      return low;
    }
    function avgKeep(times) {
      var s = 0, t;
      for (t = 0; t < DAYS; t += 0.1) s += keep(t + 0.05, times) * 0.1;
      return s / DAYS;
    }
    function sync() {
      var times = reviewsFor(S.interval);
      VZ.setPanel(pan, {
        "复习间隔": S.interval + " 天",
        "30 天内复习次数": times.length + " 次",
        "谷底（不复习）": trough([]).toFixed(1) + "%",
        "谷底（按间隔）": trough(times).toFixed(1) + "%",
        "平均（按间隔）": avgKeep(times).toFixed(1) + "%"
      });
      redraw();
    }

    sync();
  }
}

});
