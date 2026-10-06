import { reactive, ref, computed } from "vue";
import Carc, { featureSpot } from "../game.mjs";
import { resetFxMemo } from "../draw.mjs";

// —— 状态：G 为整局快照（reactive 代理，引擎直接改它触发视图更新）；S 为界面状态 ——
const ONLINE = false; // 联机对战暂未开放（代码保留，改 true 恢复入口）
const S = reactive({
  G: null,
  phase: "wait",
  uiRot: 0,
  mySeat: -1,
  joined: false,
  pending: null,
  meepleOpts: [],
  room: "",
  oppLeft: false,
  view: null,
  mouse: null,
  savedTile: null,
  tick: 0,
  lastPlaced: null,
  solo: false,
  difficulty: 1,
  cam: null,
  fx: [],
  logSeen: 0,
  drag: null,
  toast: null,
  botChoice: null,
});
const code = ref("");

let ws = null,
  wsQueue = [];
let inviteJoin = null; // 邀请链接的自动入座（连接建立即发送）
function connect() {
  // 可重建连接：回到首页会关闭旧连接，再次联机时重建
  if (ws && ws.readyState <= 1) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (e) => handleMsg(JSON.parse(e.data));
  ws.onopen = () => {
    if (inviteJoin) {
      ws.send(JSON.stringify(inviteJoin));
      inviteJoin = null;
    }
    wsQueue.splice(0).forEach((m) => ws.send(JSON.stringify(m)));
  };
  ws.onclose = () => {
    if (ws && ws.readyState > 1) ws = null;
  };
}
if (new URLSearchParams(location.search).get("room")) connect();

function handleMsg(msg) {
  if (msg.type === "error") return alert(msg.message);
  if (msg.type === "created") {
    S.mySeat = 0;
    S.room = msg.room;
  }
  if (msg.type === "joined") {
    S.mySeat = msg.seat;
    S.joined = true;
  }
  if (msg.type === "start") {
    // 重连时这条会再次触发（此前已收到 snapshot），所以不许重开新局
    S.joined = true;
    if (S.mySeat === 0 && !S.G) {
      S.G = reactive(Carc.newGame());
      if (Carc.turnStart(S.G)) beginTurnUi();
    }
  }
  if (msg.type === "snapshot") {
    const fresh = !S.G; // 重连首次拿到快照：跳过历史动画
    const prevKeys = S.G ? new Set(Object.keys(S.G.board)) : null;
    S.G = reactive(msg.data);
    S.phase = "wait";
    S.pending = null;
    S.meepleOpts = [];
    S.oppLeft = false;
    S.savedTile = null;
    if (fresh) {
      resetFxMemo();
      S.logSeen = S.G.log.length;
    } // 重连：跳过历史动画
    if (prevKeys) {
      // 记录对手刚放置的碎片（荧光高亮）
      const added = Object.keys(S.G.board).find((k2) => !prevKeys.has(k2));
      if (added) S.lastPlaced = added;
    }
    if (!S.G.over && S.G.turn === S.mySeat && Carc.turnStart(S.G))
      beginTurnUi();
  }
  if (msg.type === "restart") return resetGame();
  if (msg.type === "opponent_left") S.oppLeft = true;
}

const send = (m) => {
  // 单人模式无服务器
  if (S.solo) return;
  connect();
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
  else wsQueue.push(m);
};

function beginTurnUi() {
  S.phase = "tile";
  S.uiRot = 0;
}

function createRoom() {
  connect();
  send({ type: "create" });
}
function joinRoom() {
  send({ type: "join", room: code.value.trim().toUpperCase() });
}

function leaveToLobby() {
  // 回到首页：弃局（在线时关闭连接通知对手）
  botStop();
  if (!S.solo && ws && ws.readyState === 1) {
    inviteJoin = null;
    ws.close();
  }
  resetFxMemo();
  S.solo = false;
  S.joined = false;
  S.mySeat = -1;
  S.G = null;
  S.phase = "wait";
  S.pending = null;
  S.meepleOpts = [];
  S.savedTile = null;
  S.lastPlaced = null;
  S.fx = [];
  S.toast = null;
  S.mouse = null;
}

function rotate() {
  if (S.phase === "tile") S.uiRot = (S.uiRot + 1) % 4;
}

// —— 回合流程：放砖（跟随鼠标 → 左键确认）→ 选跟随者（砖上圆圈 / Skip / 撤销）——
function endPlace(x, y) {
  S.savedTile = S.G.current;
  S.pending = Carc.placeTile(S.G, x, y, S.uiRot);
  S.lastPlaced = S.pending;
  const rd = Carc.rotated(S.G.board[S.pending].d, S.G.board[S.pending].rot);
  const F = Carc.computeFeatures(S.G);
  const opts = [];
  rd.cities.forEach((_, i) =>
    opts.push({ k: "C", i, label: `城${rd.cities.length > 1 ? i + 1 : ""}` }),
  );
  rd.roads.forEach((_, i) =>
    opts.push({ k: "R", i, label: `路${rd.roads.length > 1 ? i + 1 : ""}` }),
  );
  if (rd.cl) opts.push({ k: "M", i: 0, label: "修道院" });
  // 全部落点都给圈：已被占用的显示灰圈，点击给出提示（规则：同段不能有两个跟随者）
  S.meepleOpts = opts.map((o) => {
    const occupied =
      Object.keys(F.aggs[F.find(`${S.pending}|${o.k}${o.i}`)].meeples).length >
      0;
    return {
      k: o.k,
      i: o.i,
      label: o.label,
      meeple: { k: o.k, i: o.i },
      spot: featureSpot(rd, o.k, o.i),
      valid: !occupied && S.G.meeplesLeft[S.mySeat] > 0,
    };
  });
  if (!S.meepleOpts.some((o) => o.valid)) return finishMove(null);
  S.phase = "meeple";
}

function finishMove(meeple) {
  Carc.endMove(S.G, S.pending, meeple);
  S.pending = null;
  S.phase = "wait";
  S.meepleOpts = [];
  S.savedTile = null;
  send({ type: "snapshot", data: S.G });
  scheduleBot();
}

function undoPlace() {
  // 撤销当前碎片放置，恢复跟随鼠标
  if (S.phase !== "meeple" || !S.pending) return;
  delete S.G.board[S.pending];
  S.G.current = S.savedTile;
  S.pending = null;
  S.meepleOpts = [];
  S.savedTile = null;
  S.phase = "tile";
}

function cvClick(e) {
  if (!S.G || !S.view) return;
  const { ox, oy, cell } = S.view;
  if (S.phase === "tile" && S.G.turn === S.mySeat && S.G.current) {
    const x = Math.floor((e.clientX - ox) / cell),
      y = Math.floor((e.clientY - oy) / cell);
    if (Carc.canPlace(S.G, x, y, S.G.current, S.uiRot)) endPlace(x, y);
    return;
  }
  if (S.phase === "meeple" && S.pending) {
    // 点击砖上的圆圈放跟随者（取最近圆圈，避免多落点误命中）
    const [tx, ty] = S.pending.split(",").map(Number);
    const lx = (e.clientX - ox) / cell - tx,
      ly = (e.clientY - oy) / cell - ty;
    let best = null,
      bd = 0.3;
    for (const o of S.meepleOpts) {
      const d2 = Math.hypot(lx - o.spot[0], ly - o.spot[1]);
      if (d2 < bd) {
        bd = d2;
        best = o;
      }
    }
    if (!best) return;
    if (best.valid) return finishMove(best.meeple);
    S.toast = { text: "该区域已有跟随者，不能重复放置", t0: performance.now() }; // 占用段：提示而非静默失败
    S.tick++;
  }
}
function onMouseMove(e) {
  S.mouse = { x: e.clientX, y: e.clientY };
  if (S.drag && S.cam) {
    // 左键拖拽平移画布（位移 >4px 才算拖拽，否则视为点击）
    const dx = e.clientX - S.drag.x,
      dy = e.clientY - S.drag.y;
    if (S.drag.moved || Math.hypot(dx, dy) > 7) {
      // 7px 内视为点击抖动，不进入平移
      S.drag.moved = true;
      S.cam.x = S.drag.camX + dx;
      S.cam.y = S.drag.camY + dy;
    }
  }
}
function onMouseDown(e) {
  if (e.button === 0 && S.cam)
    S.drag = {
      x: e.clientX,
      y: e.clientY,
      camX: S.cam.x,
      camY: S.cam.y,
      moved: false,
    };
}
function onMouseUp(e) {
  const d = S.drag;
  S.drag = null;
  if (d && !d.moved) cvClick(e); // 未拖动 → 视为点击
}
function onMouseLeave() {
  S.mouse = null;
  S.drag = null;
}
function onWheel(e) {
  // 滚轮缩放（以光标为中心）
  if (!S.cam) return;
  const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const nz = Math.min(2.5, Math.max(0.45, S.cam.zoom * f));
  const wx = (e.clientX - S.cam.x) / S.cam.zoom,
    wy = (e.clientY - S.cam.y) / S.cam.zoom;
  S.cam.x = e.clientX - wx * nz;
  S.cam.y = e.clientY - wy * nz;
  S.cam.zoom = nz;
}
function bump() {
  S.tick++;
} // 窗口尺寸变化/动画时触发画布重绘
S.requestFrame = bump;

// —— 单人模式：机器人（三段式：放砖 → 跟随者亮出 → 结算，得分动画清晰可见）——
function resetGame() {
  // 再来一次 / 单人开局：重置整局（在线时由 restart 广播触发）
  resetFxMemo(); // 新局日志行号从 0 重计，清掉旧局的动画备忘
  S.fx = [];
  S.toast = null;
  S.lastPlaced = null;
  S.pending = null;
  S.meepleOpts = [];
  S.savedTile = null;
  S.logSeen = 0;
  S.G = reactive(Carc.newGame());
  S.phase = "wait";
  S.oppLeft = false;
  if (S.mySeat === 0 && Carc.turnStart(S.G)) beginTurnUi();
  scheduleBot();
}
function restartGame() {
  send({ type: "restart" });
  resetGame();
}
function startSolo(diff = 1) {
  S.solo = true;
  S.difficulty = diff;
  S.mySeat = 0;
  S.joined = true;
  resetGame();
}
let botTimers = [];
function botAt(delay, fn) {
  const id = setTimeout(() => {
    botTimers = botTimers.filter((t2) => t2 !== id);
    fn();
  }, delay);
  botTimers.push(id);
}
function botStop() {
  botTimers.forEach(clearTimeout);
  botTimers = [];
}
const botLive = () => S.solo && S.G && !S.G.over && S.G.turn === 1;
function scheduleBot() {
  botStop();
  if (!S.solo || !S.G || S.G.over || S.G.turn !== 1) return;
  botAt(800, botStep1);
}
function botStep1() {
  // 摸牌（无地可放自动弃牌换下一张）→ 选位 → 放砖
  if (!botLive()) return;
  if (!Carc.turnStart(S.G)) {
    S.phase = "wait";
    return;
  }
  S.botChoice = botChoose(S.G);
  S.botChoice.key = Carc.placeTile(
    S.G,
    S.botChoice.x,
    S.botChoice.y,
    S.botChoice.rot,
  );
  S.lastPlaced = S.botChoice.key;
  botAt(700, botStep2);
}
function botStep2() {
  // 跟随者亮出（若选择放置）
  if (!botLive() || !S.botChoice) return;
  if (S.botChoice.meeple) {
    S.G.meeples.push({
      node: `${S.botChoice.key}|${S.botChoice.meeple.k}${S.botChoice.meeple.i}`,
      seat: 1,
    });
    S.G.meeplesLeft[1]--;
  }
  botAt(900, botStep3);
}
function botStep3() {
  // 结算：计分（触发淡出+飘字）→ 换手
  if (!botLive() || !S.botChoice) return;
  Carc.scorePass(S.G);
  S.G.turn = 0;
  if (!S.G.deck.length && !S.G.over) {
    S.G.over = true;
    Carc.finalScore(S.G);
  }
  S.botChoice = null;
  if (S.G.over || !Carc.turnStart(S.G)) S.phase = "wait";
  else beginTurnUi();
}
function botChoose(G) {
  // 按难度选位：简单=随机；普通=贪心；困难=贪心+双方在场跟随者潜在价值
  const flat = [];
  for (let rot = 0; rot < 4; rot++)
    for (const [x, y] of Carc.legalSpots(G, G.current, rot))
      flat.push({ x, y, rot });
  if (!flat.length) return { x: 0, y: 0, rot: 0, meeple: null }; // 理论不可达（turnStart 已滤掉无地可放）

  if (S.difficulty === 0) {
    // 简单：随机位 + 一半概率随机跟随者（占用则收回不放）
    const c = flat[Math.floor(Math.random() * flat.length)];
    const opts = [null];
    if (G.meeplesLeft[1] > 0 && Math.random() < 0.5) {
      const rd = Carc.rotated(G.current, c.rot);
      rd.cities.forEach((_, i) => opts.push({ k: "C", i }));
      rd.roads.forEach((_, i) => opts.push({ k: "R", i }));
      if (rd.cl) opts.push({ k: "M", i: 0 });
    }
    const mo = opts[Math.floor(Math.random() * opts.length)];
    const sim = JSON.parse(JSON.stringify(G));
    const key = Carc.placeTile(sim, c.x, c.y, c.rot);
    if (mo) {
      const F = Carc.computeFeatures(sim);
      if (Object.keys(F.aggs[F.find(`${key}|${mo.k}${mo.i}`)].meeples).length)
        return { ...c, meeple: null };
    }
    return { ...c, meeple: mo };
  }

  const cand = [];
  for (const c of flat) {
    const meOpts = [null];
    if (G.meeplesLeft[1] > 0) {
      const rd = Carc.rotated(G.current, c.rot);
      rd.cities.forEach((_, i) => meOpts.push({ k: "C", i }));
      rd.roads.forEach((_, i) => meOpts.push({ k: "R", i }));
      if (rd.cl) meOpts.push({ k: "M", i: 0 });
    }
    for (const mo of meOpts) {
      const sim = JSON.parse(JSON.stringify(G));
      const key = Carc.placeTile(sim, c.x, c.y, c.rot);
      if (mo) {
        const F = Carc.computeFeatures(sim);
        if (Object.keys(F.aggs[F.find(`${key}|${mo.k}${mo.i}`)].meeples).length)
          continue; // 段已被占
      }
      Carc.endMove(sim, key, mo);
      let sc =
        (sim.scores[1] - G.scores[1] - (sim.scores[0] - G.scores[0])) * 100 +
        (mo ? 3 : 0) +
        Math.random() * 5; // 无得失时倾向放出跟随者
      if (S.difficulty === 2) {
        // 困难：在场跟随者潜力（按完成接近度折算）+ 终局意识
        const pot = featurePotential(sim);
        sc += (pot[1] - pot[0] * 1.4) * 3; // 经营自己 ~ 抵制给对手养地
        if (sim.deck.length <= 12)
          sc +=
            (sim.scores[1] - G.scores[1] - (sim.scores[0] - G.scores[0])) * 100; // 终局只看即时得分
      }
      cand.push({ sc, ...c, meeple: mo });
    }
  }
  cand.sort((a, b) => b.sc - a.sc);
  return cand[0];
}

function featurePotential(G) {
  // 双方在场跟随者所在段的期望价值：当前分值 × 完成接近度（开口越少越接近完成）
  const pot = [0, 0];
  const { aggs } = Carc.computeFeatures(G);
  for (const root in aggs) {
    const a = aggs[root];
    for (const s of Object.keys(a.meeples)) {
      let v;
      if (a.kind === "C")
        v = ((2 * a.tiles.size + 2 * a.pennants) * 2) / (a.open.size + 1);
      else if (a.kind === "R") v = (a.tiles.size * 2) / (a.open.size + 1);
      else v = (1 + Carc.neighbors8(G, [...a.tiles][0]).length) * 1.2; // 修道院：越围满越值钱
      pot[+s] += v;
    }
  }
  return pot;
}

// —— 派生显示 ——
const screen = computed(() =>
  S.joined || S.G ? "game" : S.mySeat === 0 ? "waiting" : "lobby",
);
const inviteLink = computed(() => `${location.origin}/?room=${S.room}`);
const myTurn = computed(() => !!S.G && !S.G.over && S.G.turn === S.mySeat);
const status = computed(() => {
  if (!S.G) return "等待先手出牌…";
  if (S.G.over) {
    const you = S.G.scores[S.mySeat],
      opp = S.G.scores[1 - S.mySeat];
    return (
      `游戏结束：你 ${you} — ${opp} 对方。` +
      (you > opp ? "你赢了！🎉" : you < opp ? "对方赢了。" : "平局。")
    );
  }
  if (S.oppLeft) return "对方掉线，等待重连…";
  if (S.phase === "tile") return "你的回合：鼠标左键放置，右键旋转";
  if (S.phase === "meeple") return "放置跟随者：点击砖上圆圈，或 Skip / 撤销";
  return S.solo ? "机器人思考中…" : "等待对方…";
});
const oppName = computed(() => (S.solo ? "机器人" : "对方"));
const logText = computed(() => (S.G ? S.G.log.map((l) => l.m).join("\n") : ""));

// 自动化测试钩子
if (typeof window !== "undefined")
  window.__ui = {
    S,
    endPlace,
    finishMove,
    undoPlace,
    rotate,
    createRoom,
    joinRoom,
    startSolo,
    restartGame,
    Carc,
  };

export {
  S,
  code,
  ONLINE,
  screen,
  inviteLink,
  status,
  logText,
  myTurn,
  oppName,
  createRoom,
  joinRoom,
  startSolo,
  restartGame,
  leaveToLobby,
  endPlace,
  finishMove,
  undoPlace,
  rotate,
  cvClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheel,
  bump,
};
