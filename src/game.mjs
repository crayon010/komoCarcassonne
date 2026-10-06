// 卡卡颂规则引擎：牌堆、合法落子、连通段合并、计分。纯逻辑不碰 DOM，浏览器与 node 通用。
const SIDES = ["N", "E", "S", "W"];
const OPP = { N: "S", S: "N", E: "W", W: "E" };
const sIdx = (s) => SIDES.indexOf(s);
const k = (x, y) => `${x},${y}`;
const toXY = (key) => key.split(",").map(Number);
const nkeyOf = (x, y, side) =>
  side === "N"
    ? k(x, y - 1)
    : side === "S"
      ? k(x, y + 1)
      : side === "E"
        ? k(x + 1, y)
        : k(x - 1, y);
const who = (seat) => (seat === 0 ? "先手" : "后手");
const featName = (kind) =>
  kind === "C" ? "城" : kind === "R" ? "路" : "修道院";

const T = (e, cities = [], roads = [], cl = false, p = false) => ({
  e: [...e],
  cities,
  roads,
  cl,
  p,
});
// 原版牌表 24 种 72 张（清单见 tiles/prompts.md，D 含起始牌 ×1）；分段=城/路所贴边
const TYPE_DEFS = [
  [8, T("RFRF", [], [["N", "S"]])], // U 直路
  [9, T("RRFF", [], [["N", "E"]])], // V 弯道
  [4, T("RRRF", [], [["N"], ["E"], ["S"]])], // W 三岔口（各支路独立成段）
  [1, T("RRRR", [], [["N"], ["E"], ["S"], ["W"]])], // X 十字口
  [2, T("FFFR", [], [["W"]], true)], // A 修道院+半条路（路止于修道院）
  [4, T("FFFF", [], [], true)], // B 修道院
  [1, T("CCCC", [["N", "E", "S", "W"]], [], false, true)], // C 带盾全城
  [3, T("CRFR", [["N"]], [["E", "W"]])], // D 边城+直路（第 4 张为起始牌）
  [5, T("CFFF", [["N"]])], // E 边城
  [2, T("CFCF", [["N", "S"]], [], false, true)], // F 带盾对边贯通城
  [1, T("CFCF", [["N", "S"]])], // G 对边贯通城
  [3, T("CFCF", [["N"], ["S"]])], // H 对边城（两独立城）
  [2, T("CCFF", [["N"], ["E"]])], // I 相邻两边城（两独立城贴邻边，互不连通）
  [3, T("CRRF", [["N"]], [["E", "S"]])], // J 边城+右弯道
  [3, T("CFRR", [["N"]], [["S", "W"]])], // K 边城+左弯道（弯 S→W）
  [3, T("CRRR", [["N"]], [["E"], ["S"], ["W"]])], // L 边城+三岔路
  [2, T("CCFF", [["N", "E"]], [], false, true)], // M 带盾角城
  [3, T("CCFF", [["N", "E"]])], // N 角城
  [2, T("CCRR", [["N", "E"]], [["S", "W"]], false, true)], // O 带盾角城+弯道
  [3, T("CCRR", [["N", "E"]], [["S", "W"]])], // P 角城+弯道
  [1, T("CCCF", [["N", "E", "S"]], [], false, true)], // Q 带盾三边城
  [3, T("CCCF", [["N", "E", "S"]])], // R 三边城
  [2, T("CCCR", [["N", "E", "S"]], [["W"]], false, true)], // S 带盾三边城+路
  [1, T("CCCR", [["N", "E", "S"]], [["W"]])], // T 三边城+路
];
const START = T("CRFR", [["N"]], [["E", "W"]]); // 起始牌：北城，东西向穿门路
function makeDeck() {
  return TYPE_DEFS.flatMap(([n, t]) => Array(n).fill(t));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame(deck) {
  const G = {
    deck: deck || shuffle(makeDeck()),
    board: {},
    turn: 0,
    scores: [0, 0],
    meeplesLeft: [7, 7],
    meeples: [],
    scored: [],
    over: false,
    current: null,
    log: [],
  };
  G.board[k(0, 0)] = { d: START, rot: 0 };
  return G;
}

// 顺时针转 rot 次：原朝 s 的特征现在朝 (s+rot)；新朝向 i 的边取自原 (i-rot)
function rotated(d, rot) {
  if (!rot) return d;
  const seg = (list) =>
    list.map((s) => s.map((side) => SIDES[(sIdx(side) + rot) % 4]));
  return {
    e: [0, 1, 2, 3].map((i) => d.e[(i - rot + 4) % 4]),
    cities: seg(d.cities),
    roads: seg(d.roads),
    cl: d.cl,
    p: d.p,
  };
}
function segIndexOf(rd, kind, side) {
  const list = kind === "C" ? rd.cities : rd.roads;
  return list.findIndex((seg) => seg.includes(side));
}

function canPlace(G, x, y, def, rot) {
  if (G.board[k(x, y)]) return false;
  const e = rotated(def, rot).e;
  let touch = false;
  for (let i = 0; i < 4; i++) {
    const n = G.board[nkeyOf(x, y, SIDES[i])];
    if (!n) continue;
    touch = true;
    if (rotated(n.d, n.rot).e[(i + 2) % 4] !== e[i]) return false;
  }
  return touch;
}

function legalSpots(G, def, rot) {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  for (const key of Object.keys(G.board)) {
    const [x, y] = toXY(key);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const spots = [];
  for (let x = x0 - 1; x <= x1 + 1; x++)
    for (let y = y0 - 1; y <= y1 + 1; y++)
      if (canPlace(G, x, y, def, rot)) spots.push([x, y]);
  return spots;
}

// 全量重算连通段（牌最多 71 张，重算比增量合并少一整类同步 bug）
function computeFeatures(G) {
  const parent = {};
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const nodes = {};
  for (const key in G.board) {
    const { d, rot } = G.board[key],
      rd = rotated(d, rot);
    const push = (kind, i, seg) => {
      nodes[`${key}|${kind}${i}`] = { kind, key, sides: seg || [], rd };
    };
    rd.cities.forEach((s, i) => push("C", i, s));
    rd.roads.forEach((s, i) => push("R", i, s));
    if (rd.cl) push("M", 0, null);
  }
  for (const id in nodes) parent[id] = id;
  for (const key in G.board) {
    const [x, y] = toXY(key);
    const rd = rotated(G.board[key].d, G.board[key].rot);
    for (let i = 0; i < 4; i++) {
      const kind = rd.e[i] === "C" ? "C" : rd.e[i] === "R" ? "R" : null;
      if (!kind) continue;
      const nkey = nkeyOf(x, y, SIDES[i]);
      if (!G.board[nkey]) continue;
      const mi = segIndexOf(rd, kind, SIDES[i]);
      const ni = segIndexOf(
        rotated(G.board[nkey].d, G.board[nkey].rot),
        kind,
        OPP[SIDES[i]],
      );
      if (mi < 0 || ni < 0) continue; // 边型匹配由落子规则保证
      const a = `${key}|${kind}${mi}`,
        b = `${nkey}|${kind}${ni}`;
      parent[find(a)] = find(b);
    }
  }
  const aggs = {};
  for (const id in nodes) {
    const n = nodes[id],
      root = find(id);
    const a =
      aggs[root] ||
      (aggs[root] = {
        kind: n.kind,
        tiles: new Set(),
        open: new Set(),
        meeples: {},
        pennants: 0,
        canon: id,
      });
    if (id < a.canon) a.canon = id; // canon = 组内最小节点 id，跨重算稳定（已完成的组不会再合并）
    a.tiles.add(n.key);
    for (const s of n.sides)
      if (!G.board[nkeyOf(...toXY(n.key), s)]) a.open.add(`${n.key}:${s}`); // 对面没牌 = 开口
    if (n.kind === "C" && n.rd.p) a.pennants++;
  }
  for (const m of G.meeples) {
    const root = find(m.node);
    if (aggs[root])
      aggs[root].meeples[m.seat] = (aggs[root].meeples[m.seat] || 0) + 1;
  }
  return { aggs, find };
}

const neighbors8 = (G, key) => {
  const [x, y] = toXY(key);
  return [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ].filter(([dx, dy]) => G.board[k(x + dx, y + dy)]);
};

function scorePass(G) {
  const { aggs, find } = computeFeatures(G);
  for (const root in aggs) {
    const a = aggs[root];
    const done =
      a.kind === "M"
        ? neighbors8(G, [...a.tiles][0]).length === 8
        : a.open.size === 0;
    if (!done || G.scored.includes(a.canon)) continue;
    G.scored.push(a.canon);
    const seats = Object.keys(a.meeples).map(Number);
    if (!seats.length) continue;
    const pts =
      a.kind === "C"
        ? 2 * a.tiles.size + 2 * a.pennants
        : a.kind === "R"
          ? a.tiles.size
          : 9;
    const top = Math.max(...seats.map((s) => a.meeples[s]));
    const winners = seats.filter((s) => a.meeples[s] === top); // 平手各得全分
    const returning = G.meeples.filter((m) => find(m.node) === root);
    winners.forEach((s) => {
      G.scores[s] += pts;
    });
    G.meeples = G.meeples.filter((m) => find(m.node) !== root); // 收回跟随者
    winners.forEach((s) => {
      G.meeplesLeft[s] += a.meeples[s];
    });
    G.log.push({
      m: `${featName(a.kind)}完成 +${pts} → ${winners.map(who).join("、")}`,
    });
    for (const m of returning) {
      // 得分事件：渲染层据此做跟随者淡出 + “+N”飘字
      const [ekey, tag] = m.node.split("|");
      if (!G.board[ekey]) continue;
      const p = featureSpot(
        rotated(G.board[ekey].d, G.board[ekey].rot),
        tag[0],
        +tag.slice(1),
      );
      (G.events || (G.events = [])).push({
        logIndex: G.log.length - 1,
        key: ekey,
        kind: tag[0],
        idx: +tag.slice(1),
        seat: m.seat,
        pts,
      });
    }
  }
}

function finalScore(G) {
  const { aggs } = computeFeatures(G);
  for (const root in aggs) {
    const a = aggs[root];
    const seats = Object.keys(a.meeples).map(Number);
    if (!seats.length) continue;
    const pts =
      a.kind === "M"
        ? 1 + neighbors8(G, [...a.tiles][0]).length
        : a.kind === "C"
          ? a.tiles.size + a.pennants
          : a.tiles.size;
    seats.forEach((s) => {
      G.scores[s] += pts;
    });
    G.log.push({
      m: `终局 ${featName(a.kind)} +${pts} → ${seats.map(who).join("、")}`,
    });
  }
}

// 行动方回合开始：摸牌，无地可放就弃掉继续摸；牌堆空则终局计分
function turnStart(G) {
  if (G.over) return false;
  while (G.deck.length) {
    const d = G.deck.shift();
    if (SIDES.some((_, rot) => legalSpots(G, d, rot).length)) {
      G.current = d;
      return true;
    }
    G.log.push({ m: `${who(G.turn)}摸到「${d.e.join("")}」，无地可放，弃牌` });
  }
  G.over = true;
  finalScore(G);
  return false;
}

// 两段式落子：placeTile 更新棋盘（UI 此时展示跟随者选项），endMove 结算并换手
function placeTile(G, x, y, rot) {
  const d = G.current;
  G.current = null;
  const key = k(x, y);
  G.board[key] = { d, rot };
  return key;
}
function endMove(G, placedKey, meeple) {
  // meeple: null | {k:'C'|'R'|'M', i:序号}
  if (meeple) {
    G.meeples.push({
      node: `${placedKey}|${meeple.k}${meeple.i}`,
      seat: G.turn,
    });
    G.meeplesLeft[G.turn]--;
  }
  scorePass(G);
  G.turn = 1 - G.turn;
  if (!G.deck.length && !G.over) {
    G.over = true;
    finalScore(G);
  }
}

const MIDP = { N: [0.5, 0], E: [1, 0.5], S: [0.5, 1], W: [0, 0.5] };
export function featureSpot(rd, kind, idx) {
  // 城段/路段/修道院上跟随者落点（砖内比例坐标）
  if (kind === "M") return [0.5, 0.5];
  const seg = (kind === "C" ? rd.cities : rd.roads)[idx];
  if (seg.length === 1) {
    const m = MIDP[seg[0]];
    return [m[0] + (0.5 - m[0]) * 0.45, m[1] + (0.5 - m[1]) * 0.45];
  }
  return seg.reduce(
    (a, s) => [a[0] + MIDP[s][0] / seg.length, a[1] + MIDP[s][1] / seg.length],
    [0, 0],
  );
}

const Carc = {
  SIDES,
  OPP,
  START,
  makeDeck,
  newGame,
  rotated,
  canPlace,
  legalSpots,
  computeFeatures,
  scorePass,
  finalScore,
  turnStart,
  placeTile,
  endMove,
  neighbors8,
};
export default Carc;
