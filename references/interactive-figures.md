# 交互图：把「看不见的结构」做成能拖的东西

一页 800 字的讲解，读者往往卡在同一件事上：他在脑子里模拟第三步就断了。
这种地方配一张能拖的图，胜过再写三百字。本文是往学习站里加图的完整做法——
引擎、接线、五条视觉约束、验收清单，都按踩过的坑写。

> 脚手架已内置：`assets/scaffold/viz-core.js`（引擎）+ `viz-demo.js`（示例图）+ `.figbox` 样式。
> 教材关的第三步会自动挂 `ls.fig` 指向的图，复制就能改。

---

## 一、什么该做成图，什么不该

| 值得做 | 例子 |
|---|---|
| 概念本身有**空间或数量结构** | 复平面上的 n 次方根、单位圆、向量加法、概率分布 |
| 读者要在脑内**模拟三步以上** | 「角度除以 n，但角度有 n 种写法」 |
| **参数一变、形状就变** | 间隔变化时的遗忘曲线、杠杆长度变化时的力矩 |
| 反直觉、必须眼见为实 | 绕支点一圈 log 多出 2πi、条件概率的基数效应 |

| 不值得做 | 换成 |
|---|---|
| 纯流程（先 A 再 B） | 有序列表 / `blk` 内容块 |
| 纯定义 | 定义块 + 卡点拆解 |
| 「让页面显得丰富」 | **什么都不加**。装饰性插图会抢注意力，还占一次请求 |

判定一句话：**图要回答一个"如果……会怎样"的问题**。答不上来，它只是插图。

---

## 二、最小结构

```
viz-core.js    481 行，零依赖。SVG/Canvas 工具 + 色板 + 控件 + 注册表
viz-demo.js    图库。一张图 = 一个 VZ.define 里的键
styles.css     .figbox / .fig-title / .fig-stage / .viz-* 已备好
```

注册与挂载：

```js
/* 1. 注册（viz-*.js） */
VZ.define({
  "f-demo": {
    title: "一句标题，说清这张图在证明什么",
    hint: "怎么操作 + 看什么 + 试什么。用 <b> 标动作，用 <span class='hl'> 标结论",
    legend: [["被操作对象", VZ.C.gold], ["结果", VZ.C.cyan], ["辅助线", VZ.C.red, "line"]],
    draw: function (stage) { /* 见下一节 */ }
  }
});

/* 2. 挂载：内容数据里给一个 id */
{ t: "pair", h: "5.3 …", orig: "…", fig: "f-demo" }      // 精读页：挂在正文之后
DATA.lessons[0].fig = "f-demo"                             // 教材关：挂在第三步
```

`VZ.fig(id, host)` 负责加标题、建 `.fig-stage`、捕获 `draw()` 抛错（渲染失败显示
`.viz-missing` 而不是白屏），最后追加 legend 与 hint。**不要在 draw 里自己加标题**。

---

## 三、一张图的骨架

```js
draw: function (stage) {
  var C = VZ.C;
  var NARROW = stage.clientWidth > 0 && stage.clientWidth < 560;   /* 见约束 2 */
  var W = NARROW ? 380 : 720, H = NARROW ? 300 : 320;
  var svg = VZ.S(stage, W, H, {});                                 /* 带底色的 viewBox */

  var S = { n: 4 };                       /* 状态只放一处 */

  /* ① 静态层：网格、坐标轴、刻度——画一次就够 */
  for (var g = 0; g <= 4; g++) VZ.ln(svg, 40, 20 + g * 60, W - 20, 20 + g * 60, { stroke: C.faint });

  /* ② 动态层：先建元素，之后只改属性（d / cx / opacity），绝不重建 DOM */
  var curve = VZ.path(svg, "", VZ.stroke({ stroke: C.cyan, "stroke-width": 2.4 }));
  var dot = VZ.circ(svg, -99, -99, 4, { fill: C.gold, stroke: C.deep });

  /* ③ 控件：VZ.slider / VZ.btn / 自建 .viz-chips */
  var sN = VZ.slider(stage, {
    label: "n", min: 2, max: 12, step: 1, value: S.n,
    format: function (v) { return v + " 次"; },
    onInput: function (v) { S.n = Math.round(v); sync(); }
  });

  /* ④ 读数：VZ.panel 建行，VZ.setPanel 改值（按标签匹配，标签要一致） */
  var pan = VZ.panel(stage, { "n": "", "相邻夹角": "" });

  /* ⑤ 唯一的同步入口 */
  function redraw() { /* 只算几何，setAttribute */ }
  function sync() { VZ.setPanel(pan, { "n": S.n, "相邻夹角": (360 / S.n).toFixed(1) + "°" }); redraw(); }
  sync();
}
```

三条纪律：

1. **建一次、改多次**。滑杆每动一次就 `innerHTML = ""` 会让拖动卡顿、焦点丢失，动画也会重开。
2. **一个 `sync()`**。滑杆、按钮、拖拽都只调它，避免"拖了才更新、拉杆不更新"这类漏更新。
3. **动画用 `VZ.raf(svg, fn)`**，它会在宿主被移出文档时自动停（翻页不用手动清理）。
   每帧只做 `setAttribute`；不要在帧里算 `getBoundingClientRect`。

---

## 四、五条视觉约束（每条都踩过）

1. **只用 `VZ.C` 的色板，别搬外部 demo 的皮肤。**
   金色 = 被操作对象（z、滑块），青色 = 结果/根，品红 = AI 或钩子，紫 = 选中与验证轨迹，
   红色只留给"错误/不复习"这类对照。外部 demo 里的渐变按钮、毛玻璃卡片、`hsl()` 彩虹色
   一进来，整页的设计语言就散了。
2. **窄屏必须换版面。** 760 宽的 viewBox 塞进 330px 的手机容器会缩到 43%：
   11px 的字变成 4.7px，等于没有。判据 `stage.clientWidth < 560`，换一套更小的
   `W/H/padL`，并砍掉右侧的说明列——那些数字下面有 `.viz-panel` 兜着。
3. **标签一定会撞。** 典型：`r = 1, θ = 0` 时「1 的 n 次方根」里 z 与 w₀ 是同一点。
   两条对策：把被操作对象画成**空心环**（重合时看得出是两个东西）；重合时把标签
   翻到相反方向（外 → 内）。
4. **轴名与刻度数字错开。** `Re/Im` 放在轴末端，角度数字只标 45° 斜位；
   否则 `0°` 与 `Re`、`90°` 与 `Im` 会在轴的尽头叠成一团。
5. **图例的线段型色块不能用 `border-top`。** 全局 `box-sizing: border-box` 下
   `height: 0` 会把边框整个裁掉，图例只剩文字。用 3px 高的实心块（`viz-core` 已修）。

---

## 五、接线：两种站点结构

**单页/小站（脚手架）**：图库直接放 `viz-demo.js`，`index.html` 里在 `app.js` 之前引入；
内容数据给 `fig` 字段即可。

**多章长文站（几十章、按需加载）**：

```
1) 写进「该章本来就会加载的」viz-part*.js —— 新建一个 viz 文件会多一次请求
2) 章节数据对应 step 加 "fig": "f-xxx"
3) python3 gen/build-lazy.py     # 它按 "fig" 反查该章要哪些 viz 文件，写进 manifest
4) 单文件版无需另做：manifest.all_viz 会带上
```

`t: "fig"` 的整页图还要给 `h` 与 `text`（图缺失时退回 ASCII 示意图），
`t: "pair"` 的页只要 `fig`，图会挂在正文与卡点拆解之后。

---

## 六、验收（WebKit，别用 Chromium 代替）

```js
// 结构
document.querySelectorAll('.figbox svg').length            // 1
document.querySelectorAll('.viz-missing').length           // 0
[...document.querySelectorAll('.viz-legend i')]
  .map(i => i.getBoundingClientRect().width)               // 都 > 0（色块没被裁掉）
document.documentElement.scrollWidth - innerWidth          // 0

// 交互（手动/脚本都跑一遍）
拖动被操作对象 → 读数与滑杆同步；拉滑杆 → 图形跟着变；
点预设 → 播放/动画从头开始；翻到下一页再回来 → 不报错、动画不叠加
```

再补两条容易忘的：

- **在 390 宽截一张图**，看字是不是还认得出（这就是约束 2 的由来）。
- **翻页离开再回来**，确认 `VZ.raf` 已停——它靠 `host.isConnected` 自停，
  但如果把动画写在 `setInterval` 里，就会一直跑。

---

## 七、两个反例

**反例 A：把整页 demo 用 iframe 塞进来。**
样式两套（渐变 vs 深空）、字体再加载一次、高度写死不会自适应、
单文件打包时 iframe 的 HTML 打不进去。要的是那张**图**，不是那个**页**。

**反例 B：每帧重建 DOM。**
`stage.innerHTML = ...` 放在 `requestAnimationFrame` 里，拖动时卡成幻灯片，
输入框失焦，滑杆一动动画就重开。改成"建一次、改属性"。

---

## 八、现成的两张图

| 图 | 在哪 | 演示了什么 |
|---|---|---|
| `f-demo-forget` | 脚手架 `viz-demo.js`，挂在教材 `ls2`（遗忘不是敌人） | 单变量滑杆 + 预设 + 读数面板；窄屏换版面；`VZ.panel` 的用法 |
| `f-ch05roots` | rtr `viz-part2.js`，挂在第 5 章 18/49 页 | 多变量（n / \|z\| / θ）、拖拽、动画、点选验证、标签避让 |

抄哪个：**单变量看前者，多变量与动画看后者**。
