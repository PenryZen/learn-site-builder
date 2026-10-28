# 脚手架使用说明

`assets/scaffold/` 是**与内容无关**的可运行骨架。你只写内容层，引擎和界面不用改。

## 一、文件清单

| 文件 | 是否要改 | 说明 |
|---|---|---|
| `index.html` | 不改 | 页面外壳：HUD、五个视图、关卡视图、浮动学伴 |
| `styles.css` | 不改 | 样式 |
| `engine.js` | **不改** | SM-2、已学状态、校准、错因、成就、导出 |
| `app.js` | **不改** | 渲染与关卡流程（从 `DATA` 读一切） |
| `data.js` | **写这个** | 内容层：区域、教材、卡片、题目、关卡 |
| `lessons.js` | 可选 | 内容多时把教材单独放这里；不用就保持占位 |

## 二、起项目

```bash
mkdir my-learn-site && cd my-learn-site
cp -r <skill>/assets/scaffold/* .
cp data.template.js data.js      # 从模板开始写
# （可选）参考 data.demo.js / lessons.demo.js 看一份完整内容长什么样
```

打开 `index.html` 即可运行。纯前端、无依赖、无构建、不联网。

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
3. 每篇 lesson 字段齐全：`hook/essence/analogy/example/counter/visual/number/check`
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

## 八、想改引擎时

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