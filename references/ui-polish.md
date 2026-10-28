# 界面打磨（UI polish）

面向「已经能跑、但看着像模板」的学习站。核心不是重画，而是**换掉模板痕迹、把层级交给排版而不是装饰**。

## 一、先跑设计体检（比凭感觉改靠得住）

[Impeccable](https://github.com/pbakaus/impeccable) 是一个前端设计 skill + 确定性检测器：一条命令扫出 AI 生成界面的典型痕迹（左侧色条、渐变文字、嵌套卡片、零偏移光晕、灰字压彩色底、字号断层……）。

```bash
# 装（一次性，npm 可达即可，不需要 Claude Code）
mkdir -p ~/.workbuddy/tools/impeccable-cli && cd ~/.workbuddy/tools/impeccable-cli
[ -f package.json ] || echo '{"name":"impc","private":true}' > package.json
npm install impeccable

# 扫源码（快，但只跑正则类规则）
npx impeccable detect index.html styles.css

# 扫渲染结果（全量规则：对比度、字号、首屏栏高、标题层级）
npx impeccable detect http://127.0.0.1:8000/index.html --json
```

本机踩过的两个坑：

- **URL 扫描找不到浏览器**：`Error: No Chrome, Chromium, Edge, or Brave installation found`。把 Playwright 自带的 Chrome for Testing 指过去：
  `IMPECCABLE_BROWSER=~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing"`
- **沙箱里 Chrome 起不来**（`sandbox initialization failed`）：写一个加 `--no-sandbox` 的包装脚本，再把 `IMPECCABLE_BROWSER` 指向它。检测器只接受可执行文件，脚本也行：

```sh
#!/bin/sh
exec "$HOME/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" --no-sandbox "$@"
```

判定：**URL 扫描 0 条 = 可以交**。`--json` 输出是数组，字段 `antipattern / severity / category / file / line / snippet`。advisory 类（如 em-dashes 过多）不算失败，中文破折号属误报。

## 二、五条硬规则（成本低、观感差最大）

1. **删掉所有左侧色条**。`border-left:3px solid` 是识别度最高的 AI 痕迹。
   替代：同色淡底 + 同色 1px 全描边 + 同色块标题。语义还在，廉价感没了。
2. **删掉渐变**：文字渐变（`background-clip:text`）、按钮渐变、标签渐变、背景径向光晕，全换成实色。品牌感靠配色与留白，不靠渐变。
3. **不嵌套卡片**。卡片里只放内容；正文容器本身不要背景和边框（`.stage{background:transparent;border:0}`），让每个内容块自己成为表面。
4. **行宽是排版的命**。中文 35–45 字/行。做法是**收窄整列**（`#view-level{max-width:780px;margin:auto}`），而不是给段落加 `max-width`——后者会在宽卡片右侧留一条空洞。
5. **浏览器自带的东西也要管**：`::selection`、`:focus-visible` 焦点环、`scrollbar`、`caret-color`、`font-variant-numeric:tabular-nums`、`@media (prefers-reduced-motion:reduce)`。这几行最便宜也最像「认真做过」。

## 三、这套站的配色（可复用）

表面三级、全部带紫调，不用纯黑纯灰；信号色只留一支青，金给成就，品红只给「AI / 钩子」。

```css
--bg:#0b0918; --surf1:#151129; --surf2:#1c1735; --surf3:#241d45;
--line:#2b2452; --line2:#3d3470;
--txt:#eeeaff; --dim:#b0a8dc; --hint:#9a93c6;   /* 三者都 ≥4.5:1 */
--cyan:#3ee8f0; --cyan-ink:#04141a;             /* 实心按钮用青底深字 */
--mag:#ff5fd2; --gold:#ffd166; --ok:#4ade80; --bad:#ff7a7a;
```

对比度速查（都是踩过的）：`#7d76ab` 这类「半灰半紫」在深紫表面只有 3.7–4.1:1，**不达标**；`opacity:.45` 表示「未解锁」同样会把文字压到 2.3:1 —— 改用固定色 `#8d86b5`（≈4.6:1）而不是整体降透明度。

## 四、几个高性价比结构改动

| 症状 | 改法 |
|---|---|
| 卡片网格同排被拉成一样高，短卡内部留一大片空洞 | 容器换 CSS 多列 `columns:2`（瀑布流），卡片 `break-inside:avoid`，高度各随内容 |
| 一列拉成 1.5 屏、旁边那列只有 60% | 同上的瀑布流；同时把卡片内条目列表改为单行（行高压缩，名称不再折成两行） |
| 五个「数字+标签」小卡并排 | 合成一条信息带：一个表面 + 竖线分隔 + 等宽数字，标签 11.5px 带字距 |
| 每行都挂「100% 已通关」两块标签 | 已完成的用色点 + 分数表示，标签只留给未完成状态 |
| 八个卡片里各有一颗实心主按钮 | 全屏只留一颗实心按钮（真正的主动作），其余降为「描边 + 同色文字」 |
| `h1` 直接跳 `h4` | 面板标题 `h2`、卡片标题 `h2/h3`、正文分节 `h2`；CSS 里同步改选择器 |
| emoji 当图标（🔒 📖 ⏹ ⚙） | 控件一律写字（「原文」「停止」「设置」），配 `aria-label`；内容块类型的 emoji 前缀可删，类别交给底色与标签 |
| `<li onclick>` 鼠标专用 | 加 `role="button" tabindex="0"` + `keydown` 处理 Enter / 空格；锁定的用 `aria-disabled="true"`（注意：Playwright 的 `click()` 会因此拒绝点击，测试里改用 `evaluate(...click())`） |

## 五、验收清单

- [ ] `impeccable detect` 源码 0 条、URL 扫描 0 条（桌面 + `--viewport 390x844` 各一遍）
- [ ] WebKit 里逐视图截图：地图 / 复习 / 复盘墙 / 图鉴 / 学伴 / 关卡 / 阅读模式
- [ ] 360 / 400 / 768 / 1024 / 1280 / 1440 六档无横向溢出（`document.documentElement.scrollWidth === innerWidth`）
- [ ] 触控目标 ≥24px（脚本里量 `getBoundingClientRect()`）
- [ ] 标题大纲 `H1 H2 H2 …` 无跳级
- [ ] `:focus-visible` 真的出环（`el.matches(':focus-visible')` 为真、`outline` 解析成具体色）
- [ ] 改完跑一遍原有回归（数据结构断言 + 端到端脚本），确认只是换了皮

## Canvas 逐像素图的三个坑（曼德博这类）

站里的交互图大多用 SVG，少数（曼德博、热图）用 canvas 逐像素写。这一类有三个只会「半坏不坏」的坑：

1. **`putImageData` 不认 ctx 的 `scale(dpr)`**。高 DPI 画布通常是
   `canvas.width = w*dpr` + `ctx.scale(dpr,dpr)`，让绘制坐标回到 CSS 像素；
   但 `createImageData/cv.putImageData` 走的是**后缓冲真实像素**。
   用 `cv.w`（CSS 宽）建图，在 retina 上只会填满左上角 1/4，其余透明。
   → 画布工厂要返回 `bw/bh/dpr`，循环用 `bw/bh` 建图，坐标 `/dpr` 换回 CSS 再算。
2. **纵向比例是 `h/w`，不是 `w/h`**。点击反算复平面坐标时写成 `w/h`，
   竖向会跳 (w/h)² 倍——图被压扁、点击落点也不对，但代码看起来「有乘比例」。
3. **逐像素循环别用 `for(px++) { if (px % step) continue }`**，那是白跑 step² 倍。
   直接 `for (px; px < W; px += step)`，再用内层循环把 step×step 填满。

性能：给画布工厂一个 `maxPixels`（约 70 万），逐像素图在 retina 上才点得动；
否则 5000× 深放大要好几秒，用户会以为卡死了。

验收别靠眼睛：`getImageData` 抽样统计 `alpha === 0` 的比例（应为 0%），
再断言后缓冲宽度 ≥ 显示宽度。
