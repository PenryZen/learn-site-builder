# 脚手架使用说明

`assets/scaffold/` 是**与内容无关**的可运行骨架。你只写内容层，引擎和界面不用改。

## 一、文件清单

| 文件 | 是否要改 | 说明 |
|---|---|---|
| `index.html` | 不改 | 页面外壳：HUD、五个视图、关卡视图、浮动学伴 |
| `styles.css` | 不改 | 样式（设计系统，与「通向实在之路」同一套） |
| `kai-font.css` | **重新生成** | 长文楷体子集，`build-kai-font.py` 产物；内容变了要重跑 |
| `engine.js` | **不改** | SM-2、已学状态、校准、错因、成就、导出 |
| `app.js` | **不改** | 渲染与关卡流程（从 `DATA` 读一切） |
| `viz-core.js` | **不改** | 交互图引擎（`VZ.define` / `VZ.fig`，零依赖） |
| `viz-demo.js` | **加图改这个** | 图库：一张图 = 一个 `VZ.define` 键；已带一张遗忘曲线示例 |
| `data.js` | **写这个** | 内容层：区域、教材、卡片、题目、关卡 |
| `lessons.js` | 可选 | 内容多时把教材单独放这里；不用就保持占位 |

## 二、起项目

```bash
mkdir my-learn-site && cd my-learn-site
cp -r <skill>/assets/scaffold/* .
cp data.template.js data.js      # 从模板开始写
# （可选）参考 data.demo.js / lessons.demo.js 看一份完整内容长什么样

# 内容写完之后，按你自己的字重新子集化楷体（不跑这步会用 demo 的子集，缺字）
python3 <skill>/assets/reading/build-kai-font.py --root . --out kai-font.css
```

打开 `index.html` 即可运行。纯前端、无依赖、无构建、不联网。

> 字体输出里 400 档应在 200KB 以上；只有 3KB 说明扫到了系统里的「楷体占位包」，见 `reading-experience.md` 第二节。

## 三、写作顺序（按这个顺序最省事）

1. **定区域**（4–6 个）：按「编码→存储→提取→应用→复盘→创造」排
2. **写教材**（每区域一篇）：六段式，填 `teaches`
3. **写卡片**（30–60 张）：四段式 `vivid`，`r` 指向所属区域
4. **排关卡**：`教材关 → 训练关` 成对，顺序写进 `DATA.levels`
5. **写题目**：简答 / BOSS / 费曼 / 错因 / 创作关
6. **补可选**：`DATA.prompts`、`DATA.methods`、`DATA.achievements`

**第 2 步的 `teaches` 和第 3 步的卡片 id 要对齐**——这是三条硬规则能自动成立的前提。

## 四、关卡 `type` 一览

| type | 作用 | 需要的内容 |
|---|---|---|
| `lesson` | 微型教材，四页 + 出门检查 | `DATA.lessons` + `lv.lesson` |
| `cards` | 闪卡自评，进 SM-2 调度 | `DATA.cards` |
| `recall` | 闭卷简答，先选把握度 | `DATA.recall` |
| `feynman` | 给外行讲，揪术语 | `DATA.feynman` + `DATA.jargon` |
| `boss` | 先判别类别再选做法 | `DATA.discriminate` + `DATA.bossCats` |
| `mistake` | 错因四分类 | `DATA.mistake` |
| `create` | 写自己的方案，六项检查 | `DATA.bloomTask` |
| `encode` | 预提问 / 例子化 / 配图 | `DATA.encoding` |

`n` 是题目数量。通关线固定 80%。

## 五、内容层的硬约束（违反会静默失效或测试不过）

1. 每篇 `lesson.teaches` 只含**同区域**卡片的 id
2. 所有 `teaches` 的并集 = 全部卡片（无孤儿卡）
3. 每篇 lesson 字段齐全：`hook/essence/analogy/example/counter/visual/number/check`（`fig` 可选，指向 viz-demo.js 里的图 id）
4. 每张卡 `vivid` 含 `【一句话】`+`【类比】`，且含 `【例子】` 或 `【数字】`
5. `DATA.levels` 里，同区域的 `lesson` 必须排在训练关之前
6. `region.id`、`card.r`、`lesson.r`、`level.r` 四处的取值要对得上

## 六、换学科

只需替换 `data.js`（和可选 `lessons.js`）。引擎、界面、机制全部不动。

这是一开始就设计好的解耦：`app.js` 里没有任何学科相关的硬编码（BOSS 分类在 `DATA.bossCats`、术语表在 `DATA.jargon`）。

## 七、验证

起完项目后跑一遍自检（清单在 `anti-patterns.md`）。最低限度：

```
全新进度 → 点最靠后的训练关：进不去
全新进度 → 进「今日复习」：队列为空，卡面说「还没有可复习的卡」，评分行与「跳过本张」都隐藏
读一篇教材 → 该区域卡片全部变「已学」
读一篇教材 → 进「今日复习」：只有这个区域的卡，其他区域即使有旧记录也不出现
再把其他区域的卡强行标成 seen>0 → 仍然不出现（闸门按区域，不按卡片状态）
```

用浏览器开发者工具可直接调 `Engine` / `DATA` 检查状态：

```js
Engine.unlearnedCount()          // 未学卡数量
Engine.isLearned('c01')          // 单卡状态
DATA.lessons.map(l => l.teaches) // 教材覆盖情况
```

改过界面或字体的话，再加三条（WebKit 里量，别用 Chromium 代替）：

```js
getComputedStyle(document.querySelector('.map')).gridTemplateColumns  // 应为两列（不是一列）
[...document.fonts].filter(f => f.family === 'KaiSubset')             // 400 档 status=loaded
document.documentElement.scrollWidth - innerWidth                     // 360/400/768/1280 都为 0
```

## 八、可用的样式层（写内容时直接用，别再自造 class）

关卡正文是一堆字符串拼出来的，视觉全靠 class。下面这些在 `styles.css` 里已经定义好：

| 用途 | class | 说明 |
|---|---|---|
| 长文正文 | `rd-p` | 楷体 16.5px / 1.95；**必须**用它包正文，否则用不上内嵌字体 |
| 材料 / 钩子 | `material` / `material hook` | 中性面 / 金色面；里面若放长文字再套 `rd-p` |
| 一句话核心 | `essence` + 子元素 `eb` | 金色淡底 + 同色描边；`eb` 是小标签（如「一句话本质」） |
| 内容块 | `blk` + `def/ana/eg/der/recap/hook/mis` | 同色淡底 + 同色描边 + 同色 `blk-t` 标题，六类语义各一色 |
| 目标 / 前置 | `goalbox` / `needbox` | 绿 / 蓝，用于「这关要达成什么」「需要先会什么」 |
| 强调 | `key` / `turn` / `term`（+ `term first`） | 卡点句 / 转折词 / 术语；`.key` 横向 padding 必须为 0 |
| 卡点拆解 | `notesblk` + `note` / `note-q` / `note-a` | 金底块，问答两行都用楷体 |
| 公式 | `math-line` / `mblk mb-disp` / `.katex` | 独立成行的公式块；需另接 math.js + KaTeX（见 `reading-experience.md`） |
| 插图 | `bookfig` + `figcaption` | 白底图片 + 左对齐图注，图注可含公式 |
| 交互图 | `figbox` / `fig-title` / `viz-chip` / `viz-btn` / `viz-readout` | 配合 `viz-core.js`，**加图看 `interactive-figures.md`** |
| 朗读 | `ttsbar` / `rd-p.tts-on` / `ttscfg` | 配合 `assets/reading/tts.js` |
| 阅读滑轨 | `rd-scrub` + `rd-tip` | 进度条兼页码导航：悬停出页码/小节，点击或 ← → 跳页；`app.js` 的 `initScrub()` 已绑好 |
| 复习提示 | `resumebar` | 「回到上次位置」提示条 |
| 标签 | `pill` / `pill hot` / `pill ok` / `tag-new` / `tag-ok` | 中性 / 品红 / 绿 / 未学 / 已学 |

排版约束：`#view-level` 已经是 780px 列宽，**不要**再给段落或卡片加 `max-width`；
标题层级用 `h2`（块标题）与 `h3`（小节），不要跳级到 `h4`。

### 加一张交互图（三处改动）

```js
// 1) viz-demo.js：注册（复制那条 f-demo-forget 改掉 id 与 draw）
VZ.define({ "f-my": { title: "…", hint: "…", legend: [...], draw: function (stage) { … } } });

// 2) 教材里给 fig 字段：第三步（number）会挂图
{ id: "ls2", …, number: "…", fig: "f-my" }

// 3) 完事——app.js 里已经有 VZ.fig 的挂载点，index.html 也已引入两个 js
```

什么时候值得做、骨架怎么写、五条视觉约束（色板 / 窄屏换版面 / 标签避让 / 轴名错位 / 图例色块）
都在 `interactive-figures.md`。**先读那篇再动手**，能省掉三轮返工。

## 九、样式与 demo 站点

`assets/scaffold/styles.css` 已经是按 `ui-polish.md` 那套规范调过的版本（深色紫调、三级表面、
无色条无渐变、JS 瀑布流地图、楷体长文层、学伴分屏）。换学科时**不要动它**；
真要改观感，先跑一遍 `impeccable detect`，改完再跑一遍。

仓库里的 `docs/` 是「脚手架 + demo 数据」的在线演示（GitHub Pages 从这里发布）。
它和 `assets/scaffold/` 是**复制关系**，改了 scaffold 的 `index.html / styles.css / app.js / engine.js / kai-font.css`
就要同步过去，否则演示站展示的还是旧样式：

```bash
cp assets/scaffold/{index.html,styles.css,engine.js,app.js,kai-font.css} docs/
cp assets/scaffold/data.demo.js docs/data.js
cp assets/scaffold/lessons.demo.js docs/lessons.js
```

## 十、想改引擎时

`engine.js` 暴露的 API：

```
load/save/state/touchDay
gradeCard / dueCards / newCards / countNew / markNewTaken
openedRegions / openCards / openCardCount        ← 出卡范围（队列的唯一来源）
isLearned / markLearned / unlearnedCount / applyLessonTeaches
regionMastery / logItem / calibration / mistakeStats
awardXp / level / setLevelResult / unlocked
exportCsv / exportJson / reset
```

改之前先读 `mechanics.md` 的「测试不变量」，改完把那几条重跑一遍。