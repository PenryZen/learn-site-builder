/* 学习法远征 · 应用逻辑 */

var App = (function () {
  var S, cur = { view: "map", level: null, idx: 0, score: 0, total: 0, hintUsed: false, predicted: null, stage: null };
  var npcMode = "ask";   // ask = 只追问, review = 批改
  var curCtx = null;     // 当前题目上下文，供学伴批改

  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function shuffled(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }
  function ring(pct, color) {
    var r = 18, c = 2 * Math.PI * r;
    var p = Math.max(0, Math.min(100, pct));
    return '<svg class="ring" viewBox="0 0 46 46">' +
      '<circle cx="23" cy="23" r="' + r + '" fill="none" stroke="#332b5e" stroke-width="4.5"/>' +
      '<circle cx="23" cy="23" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" ' +
      'stroke-dasharray="' + (c * p / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 23 23)"/>' +
      '<text x="23" y="27" text-anchor="middle" font-size="11" fill="#ece9ff">' + p + '</text></svg>';
  }

  /* ---------- 视图切换 ---------- */
  function showView(v) {
    cur.view = v;
    ["map", "recall", "wall", "library", "companion", "level"].forEach(function (k) {
      var el = $("view-" + k);
      if (el) el.classList.toggle("hidden", k !== v);
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.view === v;
      t.classList.toggle("active", on);
      /* 视觉上用 .active，无障碍上要让读屏知道「当前在哪一页」 */
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    document.body.dataset.view = v;
    if (v === "map") renderMap();
    if (v === "recall") renderRecall();
    if (v === "wall") renderWall();
    if (v === "library") renderLibrary();
    if (v === "companion") renderPrompts();
    window.scrollTo(0, 0);
  }

  /* ---------- HUD ---------- */
  function renderHud() {
    $("hud-xp").textContent = S.xp;
    $("hud-lv").textContent = Engine.level();
    $("hud-streak").textContent = S.streak;
    $("hud-due").textContent = Engine.dueCards().length;
    $("hud-frag").textContent = S.fragments;
  }

  /* ---------- 地图 ---------- */
  function renderMap() {
    var html = "";
    DATA.regions.forEach(function (rg) {
      var lvs = DATA.levels.filter(function (l) { return l.r === rg.id; });
      html += '<div class="region"><h2>' + rg.name + '</h2><div class="rdesc">' + rg.desc + '</div>' +
        ring(Engine.regionMastery(rg.id), rg.color) +
        '<ul class="lvlist">';
      lvs.forEach(function (lv) {
        var rec = S.levels[lv.id];
        var lock = !Engine.unlocked(lv);
        html += '<li class="lvitem ' + (lock ? "locked" : "") + " " + (rec && rec.done ? "done" : "") + '" data-lv="' + lv.id + '"' +
          (lock ? ' role="link" aria-disabled="true"' : ' role="button" tabindex="0"') + '>' +
          '<span class="lvname">' + lv.name + '</span>' +
          (rec && rec.best ? '<span class="best">' + rec.best + '%</span>' : "") +
          /* 已通关的行有分数就够了，再挂一个「已通关」是同义重复 */
          (rec && rec.done ? "" : '<span class="badge">' + (lock ? "未解锁" : "可挑战") + '</span>') + '</li>';
      });
      if (!lvs.length) html += '<li class="lvitem plain"><span class="lvname">闪卡训练区 · 去「今日复习」</span></li>';
      html += '</ul></div>';
    });
    $("map-grid").innerHTML = html;
    layoutMap();
    document.querySelectorAll(".lvitem[data-lv]").forEach(function (li) {
      li.onclick = function () {
        if (li.classList.contains("locked")) { toast("先通关上一关：顺序是设计变量，先编码后提取。"); return; }
        openLevel(li.dataset.lv);
      };
      /* Tab 能走到每一关，Enter / 空格进入 */
      li.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.click(); }
      };
    });
  }

  /* 地图瀑布流：grid-auto-rows 是 8px 的「秒表刻度」，每张卡按实测高度占若干行，
     并且显式放进当前最矮的那一列——只算行跨度（不指定列）仍会按行对齐，
     高矮差一大就出现空洞。
     （不用 CSS columns：WebKit 不会平衡多列，卡片会全堆进第一列。） */
  var MAP_ROW = 8, MAP_GAP = 16;
  function layoutMap() {
    var map = $("map-grid");
    /* 隐藏时（别的视图里 resize）量到的都是 0，直接跳过，回到地图会重新 renderMap */
    if (!map || !map.children.length || map.offsetParent === null) return;
    var cards = [].slice.call(map.children);
    var i;
    /* 1) 全部复位成「按内容高度」，再量一次真实高度；顺序反了会量到被压扁的高度 */
    for (i = 0; i < cards.length; i++) {
      cards[i].style.gridColumn = "";
      cards[i].style.gridRow = "auto";
    }
    map.style.gridAutoRows = "auto";
    var hs = cards.map(function (c) { return c.getBoundingClientRect().height; });
    map.style.gridAutoRows = "";
    /* 2) 依次放进当前最矮的一列（等宽时靠左，保证顺序感） */
    var cols = getComputedStyle(map).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    var rows = [];
    for (i = 0; i < cols; i++) rows.push(0);
    cards.forEach(function (c, k) {
      var span = Math.max(1, Math.ceil((hs[k] + MAP_GAP) / (MAP_ROW + MAP_GAP)));
      var col = 0;
      for (var j = 1; j < cols; j++) if (rows[j] < rows[col]) col = j;
      c.style.gridColumn = String(col + 1);
      c.style.gridRow = (rows[col] + 1) + " / span " + span;
      rows[col] += span;
    });
  }

  /* ---------- 今日复习（SM-2） ---------- */
  var rc = { queue: [], cur: null, shown: false };

  function renderRecall() {
    var due = Engine.dueCards();
    var nw = Engine.newCards();
    rc.queue = shuffled(due).concat(shuffled(nw)).slice(0, 30);
    rc.cur = null; rc.shown = false;
    var openN = Engine.openCardCount();
    var un = Engine.unlearnedCount();
    if (!openN) {
      /* 卡面已经把「去读一节」说清楚了，这里不重复 */
      $("queue-info").innerHTML = "出卡范围：0 个区域 · 0 张（通关一篇教材后自动开始）";
    } else {
      $("queue-info").innerHTML = "到期卡 " + due.length + " 张 · 可领新卡 " + nw.length + " 张（每日上限 20）" +
        "　·　出卡范围：已通关 " + Object.keys(Engine.openedRegions()).length + " 个区域，共 " + openN + " 张" +
        (un ? "，还有 " + un + " 张没学" : "");
    }
    nextCard();
  }
  function nextCard() {
    if (!rc.queue.length) {
      if (!Engine.openCardCount()) {
        $("recall-front").innerHTML = '<span class="q">还没有可复习的卡</span>队列只从通关过的教材里出卡。' +
          "回去上完第一节，它的卡片才会进到这里 —— 先编码，再提取。";
      } else {
        $("recall-front").innerHTML = '<span class="q">今日队列清空</span>你已经把该复习的都取出来一遍了。<br>明天再来——间隔的意义就在于此。';
      }
      $("recall-back").classList.add("hidden");
      $("recall-grades").classList.add("hidden");
      $("recall-show").classList.add("hidden");
      $("recall-skip").classList.add("hidden");
      $("recall-meta").textContent = "";
      return;
    }
    rc.cur = rc.queue.shift();
    rc.shown = false;
    var st = S.cards[rc.cur.id];
    var learned = Engine.isLearned(rc.cur.id);
    $("recall-front").innerHTML = '<span class="q">' + esc(rc.cur.t) + " · " + esc(rc.cur.q) + '</span>';
    $("recall-back").innerHTML = '<div class="vivid">' + (rc.cur.vivid ? nl(rc.cur.vivid) : esc(rc.cur.a)) + "</div>";
    $("recall-back").classList.add("hidden");
    $("recall-grades").classList.add("hidden");
    $("recall-show").classList.remove("hidden");
    $("recall-skip").classList.remove("hidden");

    if (!learned) {
      // 初见面：没学过就不许考，先读一遍完整讲解
      rc.firstLook = true;
      $("recall-back").classList.remove("hidden");
      $("recall-show").textContent = "我读过了，考考我";
      $("recall-meta").innerHTML = '<span class="tag-new">未学 · 初见面</span> 先读完上面的讲解，再进入自测——没编码就提取等于默写没学过的东西。';
      return;
    }
    rc.firstLook = false;
    $("recall-show").textContent = "显示答案";
    $("recall-meta").innerHTML = (st && st.seen
      ? '<span class="tag-ok">已学</span> 已复习 ' + st.seen + " 次 · 当前间隔 " + st.iv + " 天 · EF " + st.ef.toFixed(2) +
        " · " + ((st.due - Engine.dayNum()) > 0 ? (st.due - Engine.dayNum()) + " 天后到期"
                 : ((st.due - Engine.dayNum()) === 0 ? "今天到期" : "已到期 " + (Engine.dayNum() - st.due) + " 天"))
      : '<span class="tag-ok">已学</span> 新卡 · 读完教材后首次进入调度');
  }
  function bindRecall() {
    $("recall-show").onclick = function () {
      if (!rc.cur) return;
      if (rc.firstLook) {
        // 读完了 → 标记已学，重新以自测模式呈现同一张卡
        Engine.markLearned(rc.cur.id);
        S = Engine.state();
        rc.firstLook = false;
        $("recall-back").classList.add("hidden");
        $("recall-show").textContent = "显示答案";
        $("recall-meta").innerHTML = '<span class="tag-ok">已学</span> 现在凭回忆想一想答案，再翻面对照。';
        toast("已标记为学过，这张卡正式进入调度");
        renderHud();
        return;
      }
      rc.shown = true;
      $("recall-back").classList.remove("hidden");
      $("recall-grades").classList.remove("hidden");
      $("recall-show").classList.add("hidden");
    };
    $("recall-skip").onclick = function () { nextCard(); };
    document.querySelectorAll("#recall-grades .g").forEach(function (b) {
      b.onclick = function () {
        if (!rc.cur) return;
        var g = +b.dataset.g;
        var cid = rc.cur.id, cr = rc.cur.r;
        var isNew = !S.cards[cid] || !S.cards[cid].seen;
        var c = Engine.gradeCard(cid, g);
        if (isNew) Engine.markNewTaken();
        var xp = g >= 4 ? 6 : (g === 3 ? 4 : 2);
        Engine.awardXp(xp);
        Engine.logItem({ type: "card", id: cid, grade: g, r: cr });
        renderHud();
        var msg = g >= 3
          ? "已排期：间隔拉长到 " + c.iv + " 天后再来"
          : "答错回炉：连续次数归零，这张卡今天还会再出现";
        nextCard();
        toast(msg);
      };
    });
  }

  /* ---------- 关卡通用 ---------- */
  function openLevel(id) {
    var lv = DATA.levels.filter(function (l) { return l.id === id; })[0];
    cur.level = lv; cur.idx = 0; cur.score = 0; cur.hintUsed = false; cur.predicted = null; cur.noScore = false;
    cur.total = lv.n;
    cur.stage = buildStage(lv);
    showView("level");
    $("lv-tag").textContent = lv.method;
    $("lv-title").textContent = lv.name;
    $("lv-brief").textContent = lv.brief;
    $("lv-method").innerHTML = "训练方法：<b>" + lv.method + "</b> · 共 " + lv.n + " 题 · 通关线 80%";
    renderStage();
  }

  function buildStage(lv) {
    if (lv.type === "lesson") {
      var ls = (DATA.lessons || []).filter(function (x) { return x.id === lv.lesson; })[0];
      if (!ls) return { kind: "encode", items: [] };
      return { kind: "lesson", lesson: ls, items: ["hook", "body", "number", "check"] };
    }
    if (lv.type === "encode") return { kind: "encode", items: shuffled(DATA.encoding).slice(0, lv.n) };
    if (lv.type === "cards") {
      var pool = DATA.cards.filter(function (c) { return c.r === lv.r; });
      var taught = pool.filter(function (c) {
        return Engine.isLearned(c.id) && (!S.cards[c.id] || !S.cards[c.id].seen);
      });
      var taughtAny = pool.filter(function (c) { return Engine.isLearned(c.id); });
      var rest = pool.filter(function (c) { return !Engine.isLearned(c.id); });
      // 优先：已学过且还没进过调度的卡；不够则用已学过的卡；仍不够才补未学的（会走初见面）
      var items = taught.concat(taughtAny).slice(0, lv.n);
      if (items.length < lv.n) items = items.concat(shuffled(rest)).slice(0, lv.n);
      return { kind: "cards", items: items };
    }
    if (lv.type === "recall") {
      var rs = shuffled(DATA.recall).slice(0, lv.n);
      return { kind: "recall", items: rs };
    }
    if (lv.type === "feynman") return { kind: "feynman", items: shuffled(DATA.feynman).slice(0, lv.n) };
    if (lv.type === "boss") return { kind: "boss", items: shuffled(DATA.discriminate).slice(0, lv.n) };
    if (lv.type === "mistake") return { kind: "mistake", items: shuffled(DATA.mistake).slice(0, lv.n) };
    if (lv.type === "create") return { kind: "create", items: [DATA.bloomTask] };
    return { kind: "encode", items: [] };
  }

  function progress() {
    var p = cur.total ? (cur.idx / cur.total) * 100 : 0;
    $("lv-progress").style.width = p + "%";
  }

  function renderStage() {
    progress();
    var stg = cur.stage, act = $("lv-actions"), fb = $("lv-feedback");
    fb.classList.add("hidden");
    act.innerHTML = "";
    if (cur.idx >= stg.items.length) { finishLevel(); return; }
    var it = stg.items[cur.idx];
    curCtx = it;
    if (stg.kind === "lesson") renderLesson(stg, it, act);
    else if (stg.kind === "encode") renderEncode(it, act);
    else if (stg.kind === "cards") renderLevelCard(it, act);
    else if (stg.kind === "recall") renderRecallQ(it, act);
    else if (stg.kind === "feynman") renderFeynman(it, act);
    else if (stg.kind === "boss") renderBoss(it, act);
    else if (stg.kind === "mistake") renderMistake(it, act);
    else if (stg.kind === "create") renderCreate(it, act);
  }

  function confRow(cb) {
    var h = '<div class="conf-row"><span style="color:var(--dim);font-size:13px">先预测把握度：</span>';
    for (var i = 1; i <= 5; i++) h += '<button class="conf" data-p="' + i + '">' + i + "</button>";
    h += "</div>";
    setTimeout(function () {
      document.querySelectorAll(".conf").forEach(function (b) {
        b.onclick = function () {
          cur.predicted = +b.dataset.p;
          document.querySelectorAll(".conf").forEach(function (x) { x.classList.remove("sel"); });
          b.classList.add("sel");
          cb && cb();
        };
      });
    }, 0);
    return h;
  }

  function needPredict() {
    if (cur.predicted === null) { toast("先选把握度——元认知校准是这一关的一部分"); return true; }
    return false;
  }

  /* ---- 教材关：先读懂，再谈练 ----
     六段内容各给一种块底色：钩子=品红、类比=紫、例子=绿、图示=青、数字=金、检查=蓝。
     长文字一律走 .rd-p（楷体长文层），块标题走屏方——两类字各自做自己的事。 */
  function nl(t) { return esc(t).replace(/\n/g, "<br>"); }
  /* 内容里常写「关键数字：d≈0.5…」，而块标题已经写了「关键数字」——
     重复一次就等于把标签念两遍。这里只切掉与块标题同名的那个前缀。 */
  function cutLabel(t, label) {
    var s = String(t || "");
    var m = s.match(/^\s*[【\[]?([^】\]]{1,10})[】\]]?\s*[：:]\s*/);
    return (m && label && m[1].indexOf(label) >= 0) ? s.slice(m[0].length) : s;
  }
  function renderLesson(stg, step, act) {
    var ls = stg.lesson;
    var head = '<div class="lesson-step">教材 ' + (cur.idx + 1) + " / 4</div>";
    var body = "", btn = "";
    if (step === "hook") {
      body = "<h2>" + esc(ls.title) + "</h2>" +
        '<div class="material hook"><p class="rd-p">' + nl(ls.hook) + "</p></div>" +
        '<div class="essence"><span class="eb">一句话本质</span>' + nl(ls.essence) + "</div>";
      btn = '<button class="btn primary" id="ls-next">继续 →</button>';
    } else if (step === "body") {
      body = '<div class="blk ana"><div class="blk-t">生活类比</div><p class="rd-p">' + nl(ls.analogy) + "</p></div>" +
        '<div class="blk eg"><div class="blk-t">具体例子</div><p class="rd-p">' + nl(ls.example) + "</p></div>" +
        '<div class="blk mis"><div class="blk-t">常见误解</div><p class="rd-p">' + nl(ls.counter) + "</p></div>";
      btn = '<button class="btn primary" id="ls-next">继续 →</button>';
    } else if (step === "number") {
      body = '<div class="blk der"><div class="blk-t">一图流</div><pre class="viz">' + nl(ls.visual) + "</pre></div>" +
        '<div class="blk recap"><div class="blk-t">关键数字</div><p class="rd-p">' + nl(cutLabel(ls.number, "关键数字")) + "</p></div>";
      /* 教材的 fig 字段：第三步可以挂一张交互图（样式见 .figbox，引擎见 viz-core.js） */
      if (ls.fig && typeof VZ !== "undefined" && VZ.has(ls.fig)) {
        body += '<div class="figbox fig-inline" id="ls-fig"></div>';
      }
      btn = '<button class="btn primary" id="ls-next">做个小检查 →</button>';
    } else {
      body = '<div class="blk def"><div class="blk-t">出门检查</div><p class="rd-p">' + nl(ls.check.q) + "</p></div>" +
        '<div class="opts" id="opts"></div>';
      btn = "";
    }
    $("lv-stage").innerHTML = head + body;
    act.innerHTML = btn;
    if (step === "number" && ls.fig && typeof VZ !== "undefined" && VZ.has(ls.fig)) {
      VZ.fig(ls.fig, $("ls-fig"));
    }
    if (step !== "check") {
      $("ls-next").onclick = function () { cur.idx++; renderStage(); };
    } else {
      var box = $("opts");
      ls.check.opts.forEach(function (o, i) {
        var b = document.createElement("button");
        b.className = "opt"; b.textContent = o;
        b.onclick = function () {
          var ok = i === ls.check.right;
          box.querySelectorAll(".opt").forEach(function (x, j) {
            if (j === ls.check.right) x.classList.add("right");
            else if (j === i) x.classList.add("wrong");
          });
          if (ok) cur.score++;
          Engine.awardXp(ok ? 6 : 2);
          Engine.logItem({ type: "lesson", id: ls.id, correct: ok });
          showFb(ok, (ok ? "读通了。" : "再想一下。") + esc(ls.check.why));
          act.innerHTML = (ok ? "" : '<button class="btn" id="ls-reread">回去重看一遍</button>') +
            '<button class="btn primary" data-next="1">' + (ok ? "完成，解锁训练关" : "继续") + "</button>";
          var rb = $("ls-reread");
          if (rb) rb.onclick = function () {
            cur.idx = 0; cur.score = Math.max(0, cur.score - 1); renderStage();
          };
          bindNext(act);
          renderHud();
        };
        box.appendChild(b);
      });
    }
  }

  /* ---- 编码关 ---- */
  function renderEncode(it, act) {
    $("lv-stage").innerHTML =
      '<div class="material">' + esc(it.material) + "</div>" +
      "<h2>" + esc(it.q) + "</h2>" +
      '<div class="opts" id="opts"></div>';
    var box = $("opts");
    it.opts.forEach(function (o, i) {
      var d = document.createElement("button");
      d.className = "opt"; d.textContent = o;
      d.onclick = function () {
        if (needPredict()) return;
        var ok = i === it.right;
        box.querySelectorAll(".opt").forEach(function (x, j) {
          if (j === it.right) x.classList.add("right");
          else if (j === i) x.classList.add("wrong");
        });
        if (ok) cur.score++;
        Engine.logItem({ type: "encode", id: it.id, predict: cur.predicted, correct: ok });
        Engine.awardXp(ok ? 8 : 3);
        showFb(ok, "<b>" + (ok ? "对了" : "再想") + "</b>：" + esc(it.why));
        act.innerHTML = '<button class="btn primary" data-next="1">下一题</button>';
        bindNext(act);
        renderHud();
      };
      box.appendChild(d);
    });
    $("lv-stage").insertAdjacentHTML("afterbegin", confRow());
  }

  /* ---- 关卡内闪卡 ---- */
  function renderLevelCard(it, act) {
    var learned = Engine.isLearned(it.id);
    var metaHtml = learned
      ? '<span class="tag-ok">已学</span> 凭回忆想一想，再翻面对照评分'
      : '<span class="tag-new">未学 · 初见面</span> 先把这张卡的讲解读一遍——读完才会进入自测';
    $("lv-stage").innerHTML =
      '<div class="card-box"><div class="card-face"><span class="q">' + esc(it.t) + "</span>" + esc(it.q) + "</div>" +
      '<div class="card-face ' + (learned ? "hidden" : "") + ' vivid" id="lv-back">' +
        (it.vivid ? nl(it.vivid) : esc(it.a)) + "</div>" +
      '<div class="card-meta" id="lv-cardmeta">' + metaHtml + "</div></div>" +
      '<div class="grade-row hidden" id="lv-grades">' +
      '<button class="g g1" data-g="1">忘记</button><button class="g g3" data-g="3">困难</button>' +
      '<button class="g g4" data-g="4">良好</button><button class="g g5" data-g="5">轻松</button></div>';
    act.innerHTML = '<button class="btn primary" id="lv-show">' + (learned ? "显示答案" : "我读过了，考考我") + "</button>";
    $("lv-show").onclick = function () {
      if (!learned) {
        Engine.markLearned(it.id);
        S = Engine.state();
        learned = true;
        $("lv-back").classList.add("hidden");
        $("lv-cardmeta").innerHTML = '<span class="tag-ok">已学</span> 凭回忆想一想，再翻面对照评分';
        act.innerHTML = '<button class="btn primary" id="lv-show">显示答案</button>';
        $("lv-show").onclick = function () {
          $("lv-back").classList.remove("hidden");
          $("lv-grades").classList.remove("hidden");
          act.innerHTML = "";
        };
        toast("已标记为学过，现在凭回忆想一想");
        renderHud();
        return;
      }
      $("lv-back").classList.remove("hidden");
      $("lv-grades").classList.remove("hidden");
      act.innerHTML = "";
    };
    document.querySelectorAll("#lv-grades .g").forEach(function (b) {
      b.onclick = function () {
        var g = +b.dataset.g;
        var c = Engine.gradeCard(it.id, g);
        if (g >= 3) cur.score++;
        Engine.awardXp(g >= 4 ? 7 : (g === 3 ? 5 : 2));
        Engine.logItem({ type: "card", id: it.id, grade: g, r: it.r });
        showFb(g >= 3, g >= 3
          ? "进入调度：间隔 <b>" + c.iv + "</b> 天后再来，EF " + c.ef.toFixed(2)
          : "回炉：连续次数归零，这张卡今天还会再出现。");
        act.innerHTML = '<button class="btn primary" data-next="1">下一张</button>';
        bindNext(act);
        renderHud();
      };
    });
  }

  /* ---- 主动回忆关 ---- */
  function renderRecallQ(it, act) {
    $("lv-stage").innerHTML =
      "<h2>" + esc(it.q) + "</h2>" +
      '<div class="pill hot">闭卷 · 不许翻材料</div>' +
      '<textarea class="ans" id="ans" placeholder="凭回忆写出你的答案…"></textarea>' +
      confRow();
    act.innerHTML = '<button class="btn ghost" id="use-hint">给个提示（扣 50%）</button>' +
      '<button class="btn ghost" id="use-learn">我还没学过，先讲一遍（本题不计分）</button>' +
      '<button class="btn primary" id="submit">提交</button>';
    $("use-hint").onclick = function () {
      cur.hintUsed = true;
      showFb(false, "提示：<b>" + esc(it.tip) + "</b>　（已扣分：提示会消除提取难度）");
      if (!act.querySelector("[data-next]")) {
        act.insertAdjacentHTML("beforeend", '<button class="btn ghost" data-next="1">跳过这题</button>');
        bindNext(act);
      }
    };
    $("use-learn").onclick = function () {
      cur.hintUsed = true;
      cur.noScore = true;
      var L = DATA.lessons.filter(function (x) { return x.r === it.r; })[0];
      showFb(false,
        "<b>先读懂它：</b><br>" + esc((L && L.essence) || "先回到教材关过一遍这个概念。") +
        "<br><br><b>类比：</b>" + esc((L && L.analogy) || "") +
        "<br><br><b>例子：</b>" + esc((L && L.example) || "") +
        "<br><br><b>关键数字：</b>" + esc((L && L.number) || "") +
        "<br><br>本题不再计分——先编码，再提取，顺序不能反。<br>建议你回到教材关，把这个概念完整过一遍。");
      if (!act.querySelector("[data-next]")) {
        act.insertAdjacentHTML("beforeend", '<button class="btn ghost" data-next="1">跳过这题</button>');
        bindNext(act);
      }
    };
    $("submit").onclick = function () {
      if (needPredict()) return;
      var v = ($("ans").value || "").trim();
      if (v.length < 4) { toast("至少写几个字——空白等于没有提取"); return; }
      var hit = 0;
      it.keys.forEach(function (k) { if (v.indexOf(k) >= 0) hit++; });
      var ratio = hit / it.keys.length;
      var ok = ratio >= 0.6;
      var gain = ok ? (cur.hintUsed ? 5 : 10) : (cur.hintUsed ? 1 : 3);
      if (cur.noScore) { gain = 2; }
      else if (ok && !cur.hintUsed) cur.score++;
      else if (ok && cur.hintUsed) cur.score += 0.5;
      Engine.awardXp(gain);
      Engine.logItem({ type: "recall", id: it.id, predict: cur.predicted, correct: ok, r: it.r });
      var missed = it.keys.filter(function (k) { return v.indexOf(k) < 0; });
      showFb(ok,
        (ok ? "提取成功，命中 " + hit + "/" + it.keys.length + " 个关键词。" : "提取不完整，命中 " + hit + "/" + it.keys.length + "。") +
        (missed.length ? " 漏掉的关键点：<span class='kwd'>" + esc(missed.join("、")) + "</span>。" : "") +
        "<br><br>参考要点：" + esc(it.a) +
        (curCtx && curCtx.vivid ? "" : ""));
      act.innerHTML = '<button class="btn primary" data-next="1">下一题</button>';
      bindNext(act);
      renderHud();
    };
  }

  /* ---- 费曼关 ---- */
  var CATS = DATA.bossCats || [];
  var DCAT = DATA.bossCatMap || {};

  function renderFeynman(it, act) {
    $("lv-stage").innerHTML =
      '<div class="pill hot">听众：' + esc(it.audience) + "</div>" +
      "<h2>请讲解：" + esc(it.topic) + "</h2>" +
      '<textarea class="ans" id="ans" placeholder="用最简单的语言讲一遍，别用术语…"></textarea>' +
      '<p class="hint">判定通过：不少于 60 字、不含术语、至少有一个例子。讲不通的地方就是你的漏洞。</p>';
    act.innerHTML = '<button class="btn primary" id="submit">讲给学伴听</button>';
    $("submit").onclick = function () {
      var v = ($("ans").value || "").trim();
      if (v.length < 10) { toast("讲得太少了，至少试着说一段"); return; }
      var pool = it.jargon.concat(JARGON_ALL).filter(function (w, i, a) { return a.indexOf(w) === i; });
      var jargons = pool.filter(function (w) { return v.indexOf(w) >= 0; });
      var hasEg = /比如|例如|举个例子|打个比方|像是|比如说/.test(v);
      var ok = v.length >= 60 && jargons.length === 0 && hasEg;
      var lines = [];
      if (v.length < 60) lines.push("· 讲得太短了（" + v.length + " 字）——讲不下去的地方，通常就是你自己没想清楚的地方。");
      if (jargons.length) lines.push("· 你用了术语：<span class='kwd'>" + esc(jargons.join("、")) + "</span>。换成大白话，或换成一个类比。");
      if (!hasEg) lines.push("· 还没有例子。给听众一个具体情境，他才能真的懂。");
      if (ok) lines.push("· 讲通了：够长、没术语、有例子。这就是费曼法的完成态。");
      else {
        var pl = it.prompts[Math.floor(Math.random() * it.prompts.length)];
        lines.push("· 学伴追问：<b>" + esc(pl) + "</b>");
      }
      if (ok) cur.score++;
      Engine.awardXp(ok ? 14 : 5);
      Engine.logItem({ type: "feynman", id: it.id, predict: cur.predicted, correct: ok });
      showFb(ok, lines.join("<br>"));
      act.innerHTML = (ok ? "" : '<button class="btn" id="retry">修改后再讲一次</button>') +
        '<button class="btn primary" data-next="1">' + (ok ? "下一题" : "跳过这题") + "</button>";
      var rt = $("retry");
      if (rt) rt.onclick = function () { $("lv-feedback").classList.add("hidden"); renderStage(); };
      bindNext(act);
      renderHud();
    };
  }

  /* ---- 交错 BOSS 关 ---- */
  function renderBoss(it, act) {
    var cat = DCAT[it.id];
    $("lv-stage").innerHTML =
      '<div class="boss-mix">' + CATS.map(function (c, i) {
        return '<span class="pill' + (i === cat ? " hot" : "") + '">' + c + "</span>";
      }).join("") + "</div>" +
      '<div class="material">' + esc(it.scene) + "</div>" +
      "<h2>第一步 · 先判别：这属于哪一类问题？</h2>" +
      '<div class="opts" id="cat-opts"></div>' +
      '<div id="step2" class="hidden"><h2>第二步 · 该用哪种做法？</h2><div class="opts" id="act-opts"></div></div>';
    var cbox = $("cat-opts");
    CATS.forEach(function (c, i) {
      var b = document.createElement("button");
      b.className = "opt"; b.textContent = c;
      b.onclick = function () {
        var ok = i === cat;
        cbox.querySelectorAll(".opt").forEach(function (x, j) {
          if (j === cat) x.classList.add("right"); else if (j === i) x.classList.add("wrong");
        });
        if (!ok) {
          Engine.logItem({ type: "boss", id: it.id, mtype: "条件误判", predict: cur.predicted, correct: false });
          showFb(false, "判别错了：这是<b>" + CATS[cat] + "</b>问题。交错练习的价值就在这第一步——先选对规则，再动手。");
          $("step2").classList.remove("hidden");
        } else {
          showFb(true, "判别正确。现在选具体做法。");
          $("step2").classList.remove("hidden");
        }
      };
      cbox.appendChild(b);
    });
    var abox = $("act-opts");
    it.opts.forEach(function (o, i) {
      var b = document.createElement("button");
      b.className = "opt"; b.textContent = o;
      b.onclick = function () {
        var ok = i === it.right;
        abox.querySelectorAll(".opt").forEach(function (x, j) {
          if (j === it.right) x.classList.add("right"); else if (j === i) x.classList.add("wrong");
        });
        if (ok) cur.score++;
        Engine.awardXp(ok ? 12 : 4);
        Engine.logItem({ type: "boss", id: it.id, predict: cur.predicted, correct: ok, mtype: ok ? null : "规则误用" });
        showFb(ok, "<b>" + (ok ? "BOSS 命中" : "被 BOSS 打回") + "</b>：" + esc(it.why));
        act.innerHTML = '<button class="btn primary" data-next="1">下一题</button>';
        bindNext(act);
        renderHud();
      };
      abox.appendChild(b);
    });
    $("lv-stage").insertAdjacentHTML("afterbegin", confRow());
  }

  /* ---- 错因归因关 ---- */
  function renderMistake(it, act) {
    $("lv-stage").innerHTML =
      '<div class="material">' + esc(it.ans) + "</div>" +
      "<h2>这个错误属于哪一类？</h2>" +
      '<div class="opts" id="opts"></div>';
    var box = $("opts");
    it.opts.forEach(function (o, i) {
      var b = document.createElement("button");
      b.className = "opt"; b.textContent = o;
      b.onclick = function () {
        var ok = i === it.right;
        box.querySelectorAll(".opt").forEach(function (x, j) {
          if (j === it.right) x.classList.add("right");
          else if (j === i) x.classList.add("wrong");
        });
        if (ok) cur.score++;
        Engine.awardXp(ok ? 9 : 3);
        Engine.logItem({ type: "mistake", id: it.id, predict: cur.predicted, correct: ok, mtype: it.opts[it.right] });
        showFb(ok, "<b>" + it.opts[it.right] + "</b>：" + esc(it.why));
        act.innerHTML = '<button class="btn primary" data-next="1">下一题</button>';
        bindNext(act);
        renderHud();
      };
      box.appendChild(b);
    });
    $("lv-stage").insertAdjacentHTML("afterbegin", confRow());
  }

  /* ---- 创作关 ---- */
  function renderCreate(it, act) {
    var list = it.checks.map(function (c) { return "· " + c.label; }).join("<br>");
    $("lv-stage").innerHTML =
      "<h2>" + esc(it.title) + "</h2>" +
      '<div class="material">' + esc(it.brief) + "</div>" +
      "<h2>六项硬指标</h2><p style='font-size:13px;color:var(--dim)'>" + list + "</p>" +
      '<textarea class="ans" id="ans" placeholder="例如：主题=考研英语阅读。第1天编码…第3天闭卷复述…第7天迁移练习…先独立作答再由AI批改…"></textarea>';
    act.innerHTML = '<button class="btn primary" id="submit">提交方案</button>';
    $("submit").onclick = function () {
      var v = ($("ans").value || "").trim();
      if (v.length < 30) { toast("至少写 30 字，方案要能执行"); return; }
      var hit = [], miss = [];
      it.checks.forEach(function (c) {
        var got = c.keys.some(function (k) { return v.indexOf(k) >= 0; });
        (got ? hit : miss).push(c.label);
      });
      var ok = hit.length >= 4;
      if (ok) cur.score++;
      Engine.awardXp(ok ? 20 : 6);
      Engine.logItem({ type: "create", predict: cur.predicted, correct: ok });
      showFb(ok,
        "达成 " + hit.length + "/6：<br>· " + hit.join("<br>· ") +
        (miss.length ? "<br><br>缺口：<span class='kwd'>" + miss.join("、") + "</span>。" : "") +
        (ok ? "<br><br>方案成立。下一步：把它抄进你的日历——设计得再好，不在时间轴上发生就等于没有。" : ""));
      act.innerHTML = (ok ? "" : '<button class="btn" id="retry">改写一版</button>') +
        '<button class="btn primary" data-next="1">' + (ok ? "完成" : "先这样") + "</button>";
      var rt = $("retry");
      if (rt) rt.onclick = function () { $("lv-feedback").classList.add("hidden"); renderStage(); };
      bindNext(act);
      renderHud();
    };
  }

  function bindNext(act) {
    var b = act.querySelector("[data-next]");
    if (b) b.onclick = function () {
      cur.idx++; cur.predicted = null; cur.hintUsed = false; cur.noScore = false;
      renderStage();
    };
  }

  function showFb(ok, html) {
    var fb = $("lv-feedback");
    fb.className = "feedback " + (ok ? "good" : "bad");
    fb.innerHTML = html;
    fb.classList.remove("hidden");
    fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function finishLevel() {
    var lv = cur.level;
    var rec = Engine.setLevelResult(lv.id, cur.score, cur.total);
    var pct = Math.round((cur.score / cur.total) * 100);
    var calib = Engine.calibration();
    $("lv-stage").innerHTML =
      "<h2>关卡结算</h2>" +
      '<div class="material">得分 <b>' + cur.score + " / " + cur.total + "</b>（" + pct + "%）· 通关线 80%<br>" +
      (rec.done ? "已通关，解锁下一区域。" : "未达 80%，同一类卡壳点还会再出现——这正是复盘阶段要处理的。") +
      "<br>历史最佳：" + rec.best + "% · 尝试次数：" + rec.tries +
      (calib.n ? "<br>当前校准误差：<b>" + calib.err.toFixed(2) + "</b>（样本 " + calib.n + "）" : "") +
      "</div>" +
      "<h2>这一关训练的是</h2><p style='font-size:13px;color:var(--dim)'>" + esc(lv.method) +
      "。回到地图，下一关会把刚才提取出来的内容推进到下一阶段。</p>";
    $("lv-actions").innerHTML = '<button class="btn primary" id="back-map">返回地图</button>' +
      '<button class="btn" id="go-due">去今日复习</button>';
    $("back-map").onclick = function () { showView("map"); };
    $("go-due").onclick = function () { showView("recall"); };
    $("lv-progress").style.width = "100%";
    renderHud();
  }

  /* ---------- 复盘墙 ---------- */
  function renderWall() {
    var rh = "";
    DATA.regions.forEach(function (rg) {
      rh += '<div class="ring-cell">' + ring(Engine.regionMastery(rg.id), rg.color) +
        "<span>" + rg.name + "</span></div>";
    });
    $("mastery-rings").innerHTML = rh;

    var m = Engine.mistakeStats();
    var max = Math.max(1, Math.max.apply(null, Object.keys(m).map(function (k) { return m[k]; })));
    $("mistake-bars").innerHTML = Object.keys(m).map(function (k) {
      return '<div class="bar"><div class="lb"><span>' + k + "</span><span>" + m[k] + "</span></div>" +
        '<div class="tr"><div class="fl" style="width:' + (m[k] / max * 100) + '%"></div></div></div>';
    }).join("");

    var c = Engine.calibration();
    $("calib").innerHTML = c.n
      ? '<div class="big">' + c.err.toFixed(2) + '</div><div class="sm">样本 ' + c.n + " 题 · 0 为完全校准</div>"
      : '<div class="sm">还没有带预测的记录。去做带「把握度」的关卡。</div>';

    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      var key = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
      days.push(S.days.indexOf(key) >= 0);
    }
    $("streak-cal").innerHTML = days.map(function (on) { return "<i class='" + (on ? "on" : "") + "'></i>"; }).join("");

    $("achv").innerHTML = (DATA.achievements || []).map(function (a) {
      var got = S.achievements.indexOf(a.id) >= 0;
      return '<span class="' + (got ? "got" : "") + '" title="' + esc(a.desc) + '">' + (got ? "★ " : "☆ ") + a.name + "</span>";
    }).join("");
  }

  /* ---------- 方法图鉴 ---------- */
  var libFilter = "all";
  var TIERS = { 1: "第一梯队 · 无条件优先", 2: "第二梯队 · 基础扎实后叠加", 3: "辅助 · 只做配角", 4: "误传 · 当反面教材" };
  function renderLibrary() {
    var list = (DATA.methods || []).filter(function (m) {
      return libFilter === "all" || String(m.tier) === libFilter;
    });
    $("lib-grid").innerHTML = list.map(function (m) {
      return '<div class="mcard t' + m.tier + '">' +
        "<h2><span>" + esc(m.name) + '</span><span class="rate">' + esc(m.rate) + "</span></h2>" +
        '<div class="tiername">' + TIERS[m.tier] + "</div>" +
        '<div class="num">效应量 / 数字：' + esc(m.d) + "</div>" +
        '<div class="why">' + esc(m.principle) + "</div>" +
        "<ol>" + m.steps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" +
        '<div class="mis">误用：' + esc(m.misuse) + "</div></div>";
    }).join("");
    document.querySelectorAll("#lib-filter .btn").forEach(function (b) {
      b.classList.toggle("primary", b.dataset.f === libFilter);
      b.onclick = function () { libFilter = b.dataset.f; renderLibrary(); };
    });
  }

  /* ---------- 提示词 ---------- */
  function renderPrompts() {
    $("prompt-grid").innerHTML = (DATA.prompts || []).map(function (p, i) {
      return '<div class="pcard"><h2>' + esc(p.m) + '</h2><div class="role">AI 角色：' + esc(p.role) + "</div>" +
        "<pre>" + esc(p.p) + "</pre>" +
        '<button class="btn small" data-copy="' + i + '">复制提示词</button></div>';
    }).join("");
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.onclick = function () {
        var txt = DATA.prompts[+b.dataset.copy].p;
        copy(txt);
        b.textContent = "已复制 ✓";
        setTimeout(function () { b.textContent = "复制提示词"; }, 1600);
      };
    });
  }
  function copy(txt) {
    try {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      toast("已复制到剪贴板");
    } catch (e) { toast("复制失败，请手动选择文本"); }
  }

  /* ---------- NPC 学伴 ----------
     浮窗 330px 在 PC 上看推导时经常憋屈：点标题栏的「⤢」把面板铺到右侧整屏高，
     正文让出等宽，形成左右分屏。偏好存本地，下次打开还是分屏。 */
  var SPLIT_KEY = "learn_npc_split_v1";
  var npcSplitWant = false;

  function npcSplitWidth() {
    var w = window.innerWidth || 1200;
    return Math.max(340, Math.min(Math.round(w * 0.44), 660));
  }
  function npcSplitOn() { return document.body.classList.contains("npc-split"); }

  function applyNpcSplit() {
    var narrow = window.matchMedia("(max-width:900px)").matches;
    var on = npcSplitWant && !narrow;      /* 手机上分屏没意义，自动降级成浮窗 */
    document.body.classList.toggle("npc-split", on);
    $("npc").classList.toggle("full", on);
    if (on) $("npc").classList.add("open");
    document.documentElement.style.setProperty("--npc-split", npcSplitWidth() + "px");
    var b = $("npc-expand");
    if (b) {
      b.textContent = on ? "⤡" : "⤢";
      b.title = on ? "收起：学伴回到右下角浮窗" : "展开为分屏：学伴铺在右侧，和网页并排看";
      b.setAttribute("aria-label", on ? "收起学伴面板" : "展开学伴面板为分屏");
    }
    /* 分屏会改正文宽度，瀑布流的列数跟着变，得重排地图 */
    if (cur.view === "map") layoutMap();
  }
  function setNpcSplit(v) {
    npcSplitWant = !!v;
    applyNpcSplit();
    try { localStorage.setItem(SPLIT_KEY, npcSplitWant ? "1" : "0"); } catch (e) {}
    toast(npcSplitWant && npcSplitOn()
      ? "学伴已铺到右侧 · 按 Esc 或点「⤡」收起"
      : (npcSplitWant ? "屏幕太窄，暂用浮窗模式" : "学伴已收回右下角"));
  }

  function setNpcMode(m, quiet) {
    npcMode = m;
    document.querySelectorAll("#npc-modes .btn").forEach(function (b) {
      b.classList.toggle("on", b.dataset.mode === m);
      b.setAttribute("aria-pressed", b.dataset.mode === m ? "true" : "false");
    });
    if (!quiet) toast(m === "ask" ? "只追问：学伴不会给你答案" : "批改：会对照关键点评价你的作答");
  }

  function initNpc() {
    $("npc-toggle").onclick = function () {
      if (npcSplitOn()) return;            /* 分屏下标题栏不再折叠，避免点错收起 */
      $("npc").classList.toggle("open");
    };
    var exp = $("npc-expand");
    if (exp) exp.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      setNpcSplit(!npcSplitWant);
    };
    try { npcSplitWant = localStorage.getItem(SPLIT_KEY) === "1"; } catch (e) { npcSplitWant = false; }
    applyNpcSplit();
    window.addEventListener("resize", applyNpcSplit);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && npcSplitOn()) setNpcSplit(false);
    });
    document.querySelectorAll("#npc-modes .btn").forEach(function (b) {
      b.onclick = function () { setNpcMode(b.dataset.mode); };
    });
    $("npc-ask").onclick = askNpc;
    $("npc-clear").onclick = function () {
      $("npc-chat").innerHTML = "";
      greetingNpc();
    };
    $("npc-export").onclick = function () {
      var lines = [];
      $("npc-chat").querySelectorAll("div").forEach(function (d) {
        lines.push((d.classList.contains("me") ? "我：" : "学伴：") + d.textContent);
      });
      download("learn_os_npc.txt", lines.join("\n\n"), "text/plain;charset=utf-8");
    };
    $("npc-input").onkeydown = function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); askNpc(); }
    };
    setNpcMode("ask", true);
    greetingNpc();
  }
  function greetingNpc() {
    say("ai", "我在。规则是：你先写答案，我只追问，不替你补充。想让我批改，就切到「批改」模式。");
  }
  function say(who, txt) {
    var c = $("npc-chat");
    var d = document.createElement("div");
    d.className = who; d.textContent = txt;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
  }
  function askNpc() {
    var v = ($("npc-input").value || "").trim();
    if (!v) { toast("先写下你自己的答案"); return; }
    say("me", v);
    $("npc-input").value = "";
    var reply = npcMode === "ask" ? askMode(v) : reviewMode(v);
    setTimeout(function () { say("ai", reply); }, 260);
  }
  var JARGON_ALL = DATA.jargon || [];
  function askMode(v) {
    var j = JARGON_ALL.filter(function (w) { return v.indexOf(w) >= 0; });
    if (v.length < 40) return "就这么点？再讲细一点。讲不下去的地方，往往就是你没想清楚的地方。";
    if (j.length) return "你说到的「" + j[0] + "」是什么意思？换成大白话，或者举个你自己的例子。";
    if (!/比如|例如|举个例子|打个比方|像是|比如说/.test(v)) return "懂了点，但能给我一个具体例子吗？没有例子我很难确认你是不是真懂。";
    if (!/为什么|因为|所以|原因在于/.test(v)) return "那为什么呢？它成立的理由是什么，前提又是什么？";
    return "好像说通了。那我问最后一个：如果把这个条件反过来，结论还成立吗？";
  }
  function reviewMode(v) {
    var lines = [];
    if (v.length < 40) lines.push("长度偏短，细节不足。");
    var j = JARGON_ALL.filter(function (w) { return v.indexOf(w) >= 0; });
    if (j.length) lines.push("术语未落地：" + j.join("、") + "——先解释它们，再继续。");
    if (!/比如|例如|举个例子/.test(v)) lines.push("缺少具体例子。");
    if (!/\d/.test(v)) lines.push("没有数字：涉及效应量与参数时，请给出具体数值并注明来源。");
    if (curCtx && curCtx.keys) {
      var miss = curCtx.keys.filter(function (k) { return v.indexOf(k) < 0; });
      if (miss.length) lines.push("对照本题关键点，缺失：" + miss.join("、") + "。");
      else lines.push("本题关键点已覆盖。");
    }
    lines.push("记住：我给的反馈不算你的产出——合上这段，重写一遍才算完成。");
    return lines.join(" ");
  }

  /* ---------- 导出 ---------- */
  function download(name, content, type) {
    var blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 100);
  }

  /* ---------- Toast ----------
     样式全在 styles.css（.toast / .toast.on），这里只管内容与计时。
     内联样式写在 JS 里等于把设计规则搬出样式表，改一次要搜两处。 */
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    /* 强制回流，让同一句连续两次提示也能重新播动画 */
    void t.offsetWidth;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }

  /* ---------- 阅读模式（大字号排版，持久化） ----------
     只作用在 #lv-stage 里的长文，不动 HUD 与按钮——否则整页缩放会失去层级。 */
  var READ_KEY = "learn_readmode_v1";
  function applyReadMode() {
    var on = false;
    try { on = localStorage.getItem(READ_KEY) === "1"; } catch (e) {}
    document.body.classList.toggle("readmode", on);
    var b = $("readmode-toggle");
    if (b) {
      b.textContent = on ? "阅读模式：开" : "阅读模式：关";
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function bindReadMode() {
    var b = $("readmode-toggle");
    if (!b) return;
    applyReadMode();
    b.onclick = function () {
      var on = !document.body.classList.contains("readmode");
      try { localStorage.setItem(READ_KEY, on ? "1" : "0"); } catch (e) {}
      applyReadMode();
      toast(on ? "阅读模式已开：大字号、宽行距，重按可切回" : "已切回标准排版");
    };
  }

  /* ---------- 启动 ---------- */
  function init() {
    S = Engine.load();
    Engine.touchDay();
    S = Engine.state();
    renderHud();
    bindRecall();
    initNpc();
    bindReadMode();
    document.querySelectorAll(".tab").forEach(function (t) {
      t.onclick = function () { showView(t.dataset.view); };
    });
    $("level-back").onclick = function () { showView("map"); };
    $("exp-csv").onclick = function () { download("learn_os_anki.csv", Engine.exportCsv(), "text/csv;charset=utf-8"); };
    $("exp-json").onclick = function () { download("learn_os_log.json", Engine.exportJson(), "application/json"); };
    $("exp-reset").onclick = function () {
      if (confirm("确定清空全部进度？此操作不可撤销。")) { Engine.reset(); S = Engine.state(); renderHud(); renderWall(); }
    };
    showView("map");
    /* 瀑布流靠实测高度：换宽度、字体回来后行高变化，都得重算一次 */
    var rt = null;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(layoutMap, 160);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { layoutMap(); });
    }
  }

  return { init: init, toast: toast, showView: showView };
})();

document.addEventListener("DOMContentLoaded", App.init);