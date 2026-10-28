# learn-site-builder

**把笔记、教材、考点做成可玩可学的网页 —— 一个按学习科学写规则的 AI Skill。**

> 🔗 **在线试玩**：https://penryzen.github.io/learn-site-builder/
> （这是脚手架 + 示例内容跑起来的样子，13 个关卡、6 个区域，纯静态）

不是又一个前端模板。它约束的是「内容怎么拆、什么时候允许考、什么时候不许考」，
脚手架只是把这些约束变成可运行的代码。

```
你的材料（PDF / 笔记 / 章节列表）
        ↓
   拆成「区域 → 关卡 → 题目」
        ↓
   先编码（读/听）→ 再提取（考）→ 按 SM-2 排期复习
        ↓
   一个纯静态网页，双击就能跑，也能直接扔上 GitHub Pages
```

---

## 它是什么 / 不是什么

**是**：一份给 AI agent 用的技能包（`SKILL.md` + 8 份方法论文档 + 可运行脚手架）。
装上之后，你对 AI 说「把这门课做成闯关网站」，它会按这套规则生成，而不是随手糊一个答题页。

**不是**：

- 不是通用前端框架（不需要它就别用）
- 不生成宣传页 / 落地页
- 不处理登录、支付、实时协作

---

## 三条硬规则

这三条是整个 skill 的地基。违反它们，页面还是能跑，但学习效果会静默归零。

### 1. 先编码，再提取

卡片有 `learned` 标志。只有教材关（`lesson`）通关、把该区域卡片批量标记已学之后，
训练关才允许考它们。没学过就撞上，走「初见面」：摊开完整解释，按钮写「我读过了，考考我」，
**不给评分按钮**。

### 2. 复习队列只从读完的章节出卡

`dueCards()` 不能在全库卡片上按 `seen/due` 过滤。那样等于按题库顺序发卡：
前几章的卡答完，取卡指针滑到下一章，用户还没读到就被考。

```js
function openedChapters() {            // 已通关关卡 → 章节集合
  var set = {};
  DATA.levels.forEach(lv => {
    if (S.levels[lv.id] && S.levels[lv.id].done && lv.chapter) {
      set[String(lv.chapter).replace(/^ch/, "")] = 1;
    }
  });
  return set;
}
```

闸门用 `done` 而不是 `learned` —— 初见面会 `markLearned`，拿它当闸门等于没有闸门。

### 3. 自检不是「看着像」

每个机制都配了可复跑的浏览器断言：数据结构检查、端到端流程、出卡范围、公式渲染、
朗读真实播放事件、线上验收。`references/anti-patterns.md` 里有完整清单。

---

## 快速开始

### 用法 A：作为 Skill 安装（推荐）

```bash
git clone https://github.com/PenryZen/learn-site-builder.git \
  ~/.workbuddy/skills/learn-site-builder     # WorkBuddy
# 或
git clone https://github.com/PenryZen/learn-site-builder.git \
  ~/.claude/skills/learn-site-builder        # Claude Code
```

重启会话，然后直接说：

> 把这份笔记做成一个闯关学习网站
> 帮我做个背诵网页，材料在 notes.md
> 这本书太长，做成能听书的精读站

### 用法 B：只用脚手架，不要 AI

```bash
cp -r assets/scaffold/* ~/my-learn-site/
cd ~/my-learn-site
cp data.template.js data.js       # 从这里开始改
python3 -m http.server 8000
```

打开 `http://localhost:8000`，纯前端、零依赖、不联网。
`data.demo.js` 与 `lessons.demo.js` 是一份完整示例（18 种学习方法的速查站），可以对照着看。

---

## 目录

```
SKILL.md                    技能入口：适用场景、工作流、数据模型
references/
├── learning-science.md     学习科学原理（间隔重复 / 检索练习 / 交错练习）
├── mechanics.md            机制实现：SM-2、出卡范围、校准、错因、成就
├── content-recipes.md      内容配方：不同学科的题库模板
├── scaffold-guide.md       脚手架使用说明 + 内容层硬约束
├── anti-patterns.md        常见反模式与交付前自检清单
├── ai-companion.md         AI 学伴集成（提示词、只追问不答）
├── ui-polish.md            界面打磨：五条硬规则 + 配色 token + 检测命令
└── reading-experience.md   长篇精读站：公式排版 / 楷体内嵌 / 三引擎朗读 / 长文强调
assets/
├── scaffold/               可运行骨架（index.html / styles.css / engine.js / app.js / data.template.js）
└── reading/                朗读与字体工具（tts.js / tts-proxy.py / build-kai-font.py）
```

---

## 长篇精读站

除了闯关型，这个 skill 还处理「一本书几千字一章、用户要连续读」的场景：

| 问题 | 做法 |
|---|---|
| 公式挤在句子里读不下去 | 长公式判定后独立成行；`a/b` 用 token 扫描还原成立式 `\frac`（正则必然崩） |
| 系统楷体在 Safari 匹配不到 | 按需字体资产的问题，必须子集内嵌；`document.fonts.check()` 会假阳性 |
| 想听书 | 三引擎（本机神经语音 / 在线 / 系统）+ `auto` 自动降级；Edge 神经语音无法浏览器直连 |
| 长文抓不住重点 | 三层标注：定义/结论句（≤70 字）、转折词、本章首次出现的术语 |

---

## 它不承诺什么

- 不会让学习变轻松，只会让「以为学会了」这件事更难发生
- 不保证每个学科的题目都能自动生成得够好 —— 内容质量仍然取决于材料本身
- 教学法主张按 Dunlosky 等（2013）的效用评级来，有争议的部分在文档里标了

---

## 贡献

Issue / PR 都欢迎。改机制之前先读 `references/mechanics.md` 的「测试不变量」，
改完把那几条重跑一遍 —— 这个项目里最贵的 bug 都是「看起来能跑」。

## License

MIT © 2026 PenryZen
