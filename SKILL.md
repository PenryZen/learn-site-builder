---
name: learn-site-builder
description: "按学习科学搭建「游戏化学习网站 / 学习网页 / 背诵网页 / 刷题网页 / 知识闯关网页 / 长文精读站」。当用户要把一门学科、一份教材、一堆笔记或考点做成一个可交互的学习网页时使用——常见说法：做个学习网站、把这门课做成闯关、帮我做个背诵网页、把笔记变成刷题站、做个记忆卡片网页、用游戏方式学这个、把这本书做成精读站、做个能听书的伴读页面。也用于把已有的学习类网页改得更适合学习者（读起来累、公式乱、想加朗读）。"
---

# learn-site-builder

把零散的笔记 / 教材 / 考点，做成可玩可学的网页。
本 skill 包含一份完整的脚手架 `assets/scaffold/`，复制并按说明改写即可上线。

## 适用场景

- 把一门课的笔记变成「闯关学习网页」（每关卡是 5-15 道交互题）
- 把单词表做成「记忆卡片网页」（间隔重复 + 翻转动画）
- 把知识点做成「背诵网页」（填空 / 排序 / 连线）
- 把习题集做成「刷题网页」（按章节解锁、错题本、计时挑战）
- 把任何学习材料做成「游戏化网页」（积分 / 徽章 / 关卡）
- 把一本教材 / 一篇长文做成「可读可听的精读站」（逐段原文＋讲授、公式排版、朗读）

## 不适用

- 通用前端开发（用通用技能）
- 静态宣传页 / 落地页
- 复杂 SPA（含登录、支付、实时协作）

## 工作流

1. 需求澄清：学科 + 题材 + 学习目标 + 预估题量
2. 内容整理：用户提供原始材料（笔记 / 教材 / 章节列表）
3. 题库设计：按学习科学拆解为「关卡 → 题目」结构
4. 复制脚手架：`assets/scaffold/` → 项目目录
5. 替换数据：编辑 `data.js` 填入真实题库（教材多时另写 `lessons.js`）
6. 重建楷体子集：`python3 assets/reading/build-kai-font.py --root . --out kai-font.css`（不跑就会缺字）
7. 本地预览：双击 `index.html` 或 `python -m http.server`
8. 视觉调优：**不要从零设计**，脚手架已内置设计系统（见 `references/ui-polish.md` 第六节）；
   要改先跑 `impeccable detect`，改完再跑一遍，并在 WebKit 里逐视图截图
9. 发布：可选托管到 WorkBuddy Sites 或本地静态服务

## 数据模型

```js
window.LESSONS = [
  {
    id: 'L1',
    title: '认识概率',
    intro: '从掷骰子开始理解不确定性',
    cards: [
      { type: 'flashcard', front: '概率', back: '...', hint: '...' },
      { type: 'quiz', question: '...', options: [...], answer: 0, explain: '...' },
      { type: 'cloze', text: '掷一枚公平硬币，正面朝上的概率是 ___', answer: '0.5' },
      { type: 'sort', items: ['...', '...'], answer: [...], explain: '...' },
      { type: 'match', pairs: [{left:'...', right:'...'}, ...] },
    ],
  },
];
```

## 题型参考

- `flashcard`：双面卡片（间隔重复 + 翻转动画）
- `quiz`：单选 / 多选题
- `cloze`：填空题
- `sort`：排序题
- `match`：连线配对题
- `timeline`：难度细分（顺序排列历史事件）

## 长篇精读站（长文型，和闯关型并存）

单章几千字、用户要连续读的站点，瓶颈不在「有没有关卡」，而在**读起来累不累**。三件按收益排序：

| 项 | 一句话结论 | 详情 |
|---|---|---|
| 公式排版 | 长公式判定后独立成行；`a/b` 用 token 扫描还原成立式 `\frac`（正则必然崩） | `references/reading-experience.md` §1 |
| 正文字体 | 系统楷体在 Safari **匹配不到**（按需字体资产），必须子集内嵌；`document.fonts.check()` 会假阳性 | §2 |
| 朗读 | Edge 神经语音**无法浏览器直连**（`Sec-MS-GEC` 头被规范封死），三引擎 + `auto` 自动降级 | §3 |

可直接复用的实现见 `assets/reading/`：

| 文件 | 用途 |
|---|---|
| `tts.js` | 三引擎朗读（proxy / online / browser）+ auto 选路 + 双缓冲预取 |
| `tts-proxy.py` | 本机 edge-tts 代理（晓晓神经语音，`GET /voices`、`GET /tts`） |
| `朗读服务.command` | 一键装成开机自启系统服务（无窗口、KeepAlive） |
| `build-kai-font.py` | 扫项目字符 → 子集化系统楷体 → 输出 base64 `kai-font.css` |

```bash
# 字体（装一次：pip install fonttools brotli）
python3 assets/reading/build-kai-font.py --root . --family KaiSubset
```

## 交互图（概念有空间/数量结构时）

文字讲到「角度除以 n，但角度有 n 种写法」这类地方，读者第三步就在脑内断了——那正是配图的信号。
脚手架已内置引擎与一张示例图：`viz-core.js`（481 行、零依赖）+ `viz-demo.js`，
教材关的第三步自动挂 `ls.fig` 指向的图。

```js
VZ.define({ "f-x": { title, hint, legend, draw: function (stage) { /* 建一次，改属性 */ } } });
```

五条硬约束（都踩过）：只用 `VZ.C` 色板、不搬外部 demo 的渐变皮肤；`stage.clientWidth < 560`
必须换窄屏版面（否则 760 宽缩到 43%，字变 4.7px）；标签重合要改方向；轴名与刻度数字错开；
图例线段用 3px 实心块（`border-top` + `height:0` 在 border-box 下会被裁掉）。
细则与验收见 `references/interactive-figures.md`。

要动观感先看 `references/ui-polish.md`：左侧色条、渐变文字、嵌套卡片是三个最显眼的模板痕迹，一条设计检测命令就能扫出来。

两条最容易踩的坑，先记住：

- **必须在 WebKit 里验收**，Chromium 通过不代表 Safari 通过（字体、自动播放都是如此）
- 沙箱里 `launchctl bootstrap` 会报 `5: Input/output error`、`osascript` 加登录项报 `-10004`——这类安装动作要留给用户在自己终端里双击

## 参考资料

- `references/learning-science.md`：学习科学原理（间隔重复 / 检索练习 / 交错练习）
- `references/mechanics.md`：游戏化机制（积分 / 徽章 / 关卡）与 SM-2 调度，含**出卡范围**（只从读完的章节出卡）
- `references/scaffold-guide.md`：脚手架使用说明
- `references/content-recipes.md`：内容配方（不同学科的题库模板）
- `references/anti-patterns.md`：常见反模式
- `references/ai-companion.md`：AI 学习伴侣集成
- `references/ui-polish.md`：界面打磨（Impeccable 体检接入 / 五条硬规则 / 配色 token / 验收清单）
- `references/reading-experience.md`：长篇精读站（公式独立成行 / 楷体子集内嵌 / 三引擎朗读 / 图注里的数学 / 长文强调 / **公式引擎的加载顺序**）+ 总验收清单
- `references/interactive-figures.md`：交互图（什么时候值得做 / VZ 骨架 / 五条视觉约束 / 接线 / WebKit 验收）

## 脚手架

完整可运行的最小化示例见 `assets/scaffold/`：

```
scaffold/
├── index.html        # 入口（双击即可运行）
├── styles.css        # 设计系统（三级表面 / 瀑布流地图 / 长文层 / 学伴分屏）
├── kai-font.css      # 楷体子集（build-kai-font.py 生成，换内容后重跑）
├── engine.js         # SM-2 调度、已学状态、校准、错因、成就、导出
├── app.js            # 视图渲染与关卡流程（从 DATA 读一切）
├── viz-core.js       # 交互图引擎（零依赖，VZ.define / VZ.fig）
├── viz-demo.js       # 示例交互图（遗忘曲线），复制改 id 就能加自己的
├── lessons.js        # 教材（多时单独放；不用就保持占位）
├── data.demo.js      # 演示数据（开箱即用）
└── data.template.js  # 空模板（复制成 data.js 后填内容）
```

界面与交互已经是成品级：HUD 信息带、Safari 也平衡的两列瀑布流、780px 正文列宽、
六类内容块的同色描边语言、`.key/.term/.turn` 长文强调、阅读模式、学伴「⤢」分屏、
`:focus-visible` 焦点环与 `aria-*` 状态。**新站不需要重新设计外观**，只写内容。

## 部署

脚手架是纯静态 HTML/CSS/JS，可直接：
- 双击 `index.html` 在浏览器打开（部分浏览器限制 file:// 协议，推荐本地服务器）
- `python -m http.server 8000` 启动本地服务
- 上传到任何静态托管（WorkBuddy Sites / GitHub Pages / Vercel / Netlify）
- 打包成 zip 或单 HTML 文件分发

单文件打包的两个体积提醒：内嵌楷体 woff2 约 **+2MB**（体积换跨浏览器一致）；朗读不受影响（在线引擎走网络，代理引擎也走本机端口），别把模型或代理塞进 HTML。

### GitHub Pages 的四个坑（都踩过）

1. **构建要 20–60 秒，期间访问就是 404**。`gh api repos/<owner>/<repo>/pages/builds/latest -q .status`
   轮询到 `built` 之后再发链接给用户，否则他点开正好撞上构建窗口。
2. **页面缓存 `max-age=600`**。构建刚完成时用户若访问过，会拿到缓存了十分钟的 404。
   用 `?v=<时间戳>` 绕过，或让用户硬刷新（Cmd+Shift+R）。
3. **加 `.nojekyll`**。不然下划线开头的文件（`_xxx.js`）会被 Jekyll 吞掉。
4. **加 `404.html`**。项目站下任何拼错的路径都落到它；写一个深空配色、带「回首页」按钮、
   3 秒自动跳回站点根的自定义页，比 GitHub 那张灰白默认页好得多。

发布后必须验三件事：`index.html` 200、某个 JS 资源 200、一个不存在的路径返回**自己的** 404 页（看标题是不是 `<title>Page not found · GitHub Pages</title>`，是就说明 `404.html` 没生效）。

国内访问 `*.github.io` 不稳，页面打不开时先 `dig +short <user>.github.io`：
正常是 `185.199.108–111.153` 四个地址，出现别的就说明被 DNS 污染了。

## 使用本 skill 的提示

当用户说：
- 「做个学习网站」「做成闯关」「帮我做个背诵网页」
- 「把笔记变成刷题站」「用游戏方式学这个」
- 「我有一堆笔记，做成学习网页」

→ 加载本 skill，按工作流执行。

## 注意事项

- 题库数据可能在浏览器中实现，正文 JSON 存放在 `data.js`
- 双击 `index.html` 在浏览器打开（部分浏览器限制 file:// 协议，推荐本地服务器）
- 全部样式在 `styles.css`，不依赖外部框架
- 脚手架为纯静态 HTML/CSS/JS，不依赖外部框架
- 推荐用 `python -m http.server` 启动本地服务
- 用了 `assets/reading/` 的三件套就要**用 WebKit 验收**：字体是否真的加载、朗读是否真的出声、段间有没有空档，Chromium 全过也不代表 Safari 能过
- 朗读代理依赖 `pip install edge-tts`（走微软在线语音，需联网）；纯离线场景退回系统语音，别承诺「离线也能神经朗读」