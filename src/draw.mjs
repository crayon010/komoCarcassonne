import Carc, { featureSpot } from "./game.mjs";

// 极简扁平风格：暗色桌面、纯色几何块、白路细棕描边；砖面几何规范见 tiles/prompts.md
const C = {
  bg: "#0e0b13",
  grid: "#231d2b",
  grass: "#8fbc6a",
  outline: "#8a6f4d",
  road: "#f7f3e8",
  roadEdge: "#a5906c",
  wall: "#e9cd96",
  roof: "#e08794",
  base: "#7a5a50",
  shield: "#c9ced4", // 银灰色
};

let fxDone = new Set(); // 已动画过的得分事件（按日志行号）；重开新局时清空
export function resetFxMemo() {
  fxDone.clear();
}
const TILE = 90; // 世界坐标下的砖块边长（相机缩放的基准）

// 4×4 子格几何，规范详见 tiles/prompts.md：边中点 N(2,0) E(4,2) S(2,4) W(0,2)
const MID4 = { N: [2, 0], E: [4, 2], S: [2, 4], W: [0, 2] };
const CORNER4 = { N: [4, 0], E: [4, 4], S: [0, 4], W: [0, 0] }; // a 与 a+1 两边的夹角
const SIDES = ["N", "E", "S", "W"];
const idx4 = (s) => SIDES.indexOf(s);
const rp4 = (p, r) => {
  for (let i = 0; i < r; i++) p = [4 - p[1], p[0]];
  return p;
}; // 顺时针 90°×r

function cityPoly4(seg) {
  const n = seg.length;
  if (n === 1)
    return {
      poly: [
        [0, 0],
        [4, 0],
        [3, 1],
        [1, 1],
      ],
      rot: idx4(seg[0]),
    }; // 底边贴满整边，短边 2 格位于 1/4 处，面积 3/16
  if (n === 2) {
    const a = idx4(seg[0]),
      b = idx4(seg[1]);
    if ((a + 1) % 4 === b)
      return {
        poly: [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        rot: a,
      }; // 邻边三角
    if ((b + 1) % 4 === a)
      return {
        poly: [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        rot: b,
      };
    // 对边贯通带：左右草地各为梯形 3/16（原版真实砖型）
    return {
      poly: [
        [0, 0],
        [4, 0],
        [3, 1],
        [3, 3],
        [4, 4],
        [0, 4],
        [1, 3],
        [1, 1],
      ],
      rot: seg.includes("N") ? 0 : 1,
    };
  }
  if (n === 3) {
    const miss = SIDES.find((s) => !seg.includes(s));
    // U形：草地凹口呈梯形（底边贴满缺边 4 格，短边 2 格位于 1/4 处，面积 3/16）
    return {
      poly: [
        [1, 1],
        [1, 3],
        [0, 4],
        [4, 4],
        [4, 0],
        [0, 0],
      ],
      rot: (idx4(miss) - 3 + 4) % 4,
    };
  }
  if (n === 4)
    return {
      poly: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
    }; // 全城：整体城堡色（中央不再露草地）
}

function roadPath4(ctx, px, py, u, seg) {
  const P = (p) => [px + p[0] * u, py + p[1] * u];
  ctx.beginPath();
  if (seg.length === 1) {
    // 尽头路：边中点 → 地块中心
    ctx.moveTo(...P(MID4[seg[0]]));
    ctx.lineTo(...P([2, 2]));
    return;
  }
  const a = idx4(seg[0]),
    b = idx4(seg[1]);
  if ((a + 1) % 4 === b || (b + 1) % 4 === a) {
    // 四分之一圆弧：圆心 = 两边夹角
    const [cx, cy] = CORNER4[(a + 1) % 4 === b ? seg[0] : seg[1]];
    const ma = MID4[seg[0]],
      mb = MID4[seg[1]];
    const a0 = Math.atan2(ma[1] - cy, ma[0] - cx);
    const a1 = Math.atan2(mb[1] - cy, mb[0] - cx);
    ctx.arc(px + cx * u, py + cy * u, 2 * u, a0, a1, true);
    return;
  }
  ctx.moveTo(...P(MID4[seg[0]])); // 对边直穿
  ctx.lineTo(...P(MID4[seg[1]]));
}

export function drawBoard(cv, S) {
  const ctx = cv.getContext("2d");
  const W = cv.width,
    H = cv.height;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const G = S.G;
  if (!G) return;
  if (!S.cam) S.cam = { x: W / 2 - TILE / 2, y: H / 2 - TILE / 2, zoom: 1 }; // 相机：世界原点的屏幕偏移 + 缩放
  const { x: camX, y: camY, zoom } = S.cam;
  const cell = TILE * zoom;
  S.view = { ox: camX, oy: camY, cell };
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  for (const key of Object.keys(G.board)) {
    const [x, y] = key.split(",").map(Number);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(zoom, zoom);
  ctx.strokeStyle = C.grid; // 全屏网格（世界坐标）
  ctx.lineWidth = 1 / zoom;
  const wx0 = -camX / zoom,
    wy0 = -camY / zoom,
    wx1 = (W - camX) / zoom,
    wy1 = (H - camY) / zoom;
  for (let gx = Math.floor(wx0 / TILE); gx <= Math.ceil(wx1 / TILE); gx++) {
    ctx.beginPath();
    ctx.moveTo(gx * TILE, wy0);
    ctx.lineTo(gx * TILE, wy1);
    ctx.stroke();
  }
  for (let gy = Math.floor(wy0 / TILE); gy <= Math.ceil(wy1 / TILE); gy++) {
    ctx.beginPath();
    ctx.moveTo(wx0, gy * TILE);
    ctx.lineTo(wx1, gy * TILE);
    ctx.stroke();
  }
  for (const key in G.board) {
    const [x, y] = key.split(",").map(Number);
    const { d, rot } = G.board[key];
    drawTile(ctx, x * TILE, y * TILE, TILE, Carc.rotated(d, rot));
  }
  if (S.lastPlaced && G.board[S.lastPlaced]) {
    // 上一次放置位置的荧光高亮
    const [lx, ly] = S.lastPlaced.split(",").map(Number);
    const z = S.cam ? S.cam.zoom : 1;
    ctx.save();
    ctx.shadowColor = "#b6ff7a";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "#c8ff8a";
    ctx.lineWidth = 3 / z;
    ctx.strokeRect(
      lx * TILE - 2 / z,
      ly * TILE - 2 / z,
      TILE + 4 / z,
      TILE + 4 / z,
    );
    ctx.restore();
  }
  if (S.phase === "tile" && S.G.current) {
    // 可放位置淡色填充提示
    ctx.fillStyle = "rgba(255, 226, 140, .22)";
    for (const [sx, sy] of Carc.legalSpots(G, G.current, S.uiRot))
      ctx.fillRect(sx * TILE, sy * TILE, TILE, TILE);
  }
  if (S.phase === "tile" && S.mouse && S.G.current) {
    // 碎片跟随鼠标：吸附网格，合法绿框 / 非法红框
    const cx = Math.floor((S.mouse.x - camX) / cell),
      cy = Math.floor((S.mouse.y - camY) / cell);
    const ok = Carc.canPlace(G, cx, cy, G.current, S.uiRot);
    ctx.fillStyle = ok ? "rgba(255,255,255,.08)" : "rgba(224,80,80,.30)";
    ctx.fillRect(cx * TILE, cy * TILE, TILE, TILE);
    ctx.globalAlpha = 0.62;
    drawTile(ctx, cx * TILE, cy * TILE, TILE, Carc.rotated(G.current, S.uiRot));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? "#9fd99f" : "#e07070";
    ctx.lineWidth = 3 / zoom;
    ctx.strokeRect(
      cx * TILE + 2 / zoom,
      cy * TILE + 2 / zoom,
      TILE - 4 / zoom,
      TILE - 4 / zoom,
    );
  }
  if (S.phase === "meeple" && S.pending) {
    // 已放砖高亮 + 可放跟随者的圆圈
    const [tx, ty] = S.pending.split(",").map(Number);
    ctx.strokeStyle = "#9fd99f";
    ctx.lineWidth = 3 / zoom;
    ctx.strokeRect(
      tx * TILE + 2 / zoom,
      ty * TILE + 2 / zoom,
      TILE - 4 / zoom,
      TILE - 4 / zoom,
    );
    for (const o of S.meepleOpts) {
      ctx.beginPath();
      ctx.arc(
        (tx + o.spot[0]) * TILE,
        (ty + o.spot[1]) * TILE,
        Math.max(7, TILE * 0.12),
        0,
        7,
      );
      ctx.fillStyle = o.valid ? "rgba(20,22,26,.55)" : "rgba(20,22,26,.25)";
      ctx.fill();
      ctx.strokeStyle = o.valid ? "#ffffff" : "rgba(255,255,255,.38)";
      ctx.lineWidth = (o.valid ? 3 : 2) / zoom;
      ctx.stroke();
    }
  }
  for (const m of G.meeples) {
    const [key, tag] = m.node.split("|");
    const rd = Carc.rotated(G.board[key].d, G.board[key].rot);
    const p = featureSpot(rd, tag[0], +tag.slice(1));
    const [tx, ty] = key.split(",").map(Number);
    ctx.beginPath();
    ctx.arc((tx + p[0]) * TILE, (ty + p[1]) * TILE, TILE * 0.1, 0, 7);
    ctx.fillStyle = m.seat === 0 ? "#d64541" : "#3b6fd4";
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = TILE * 0.03;
    ctx.stroke();
  }
  // —— 得分动画：跟随者淡出 + “+N” 飘字（由 scorePass 记录的事件驱动，双端通用）——
  const newLines = G.log.slice(S.logSeen || 0).map((l) => l.m);
  const oldSeen = S.logSeen || 0;
  S.logSeen = G.log.length;
  const discard = newLines.find((m) => m.includes("无地可放，弃牌"));
  if (discard) S.toast = { text: discard, t0: performance.now() }; // 无地可放自动换下一张的提示
  if (G.events)
    for (const ev of G.events) {
      if (fxDone.has(ev.logIndex) || ev.logIndex < oldSeen) continue; // 已动画过 / 重连补历史跳过
      fxDone.add(ev.logIndex);
      const b = G.board[ev.key];
      if (!b) continue;
      const p = featureSpot(Carc.rotated(b.d, b.rot), ev.kind, ev.idx);
      const [evx, evy] = ev.key.split(",").map(Number);
      S.fx.push({
        wx: (evx + p[0]) * TILE,
        wy: (evy + p[1]) * TILE,
        seat: ev.seat,
        pts: ev.pts,
        t0: performance.now(),
      });
    }
  const now = performance.now();
  S.fx = S.fx.filter((f) => now - f.t0 < 2100); // 得分淡出动画 2.1s
  for (const f of S.fx) {
    const p = (now - f.t0) / 2100;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.arc(f.wx, f.wy, TILE * 0.1, 0, 7);
    ctx.fillStyle = f.seat === 0 ? "#d64541" : "#3b6fd4";
    ctx.fill();
    if (f.pts != null) {
      ctx.font = `bold ${Math.round(TILE * 0.26)}px system-ui`;
      ctx.textAlign = "left";
      const tx2 = f.wx + TILE * 0.28,
        ty2 = f.wy - TILE * 0.1 - p * TILE * 0.5;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,.6)";
      ctx.strokeText("+" + f.pts, tx2, ty2);
      ctx.fillStyle = "#ffd75e";
      ctx.fillText("+" + f.pts, tx2, ty2);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (S.toast) {
    // 弃牌提示条（屏幕空间，顶部居中，渐隐）
    const age = performance.now() - S.toast.t0;
    if (age > 2200) S.toast = null;
    else {
      ctx.globalAlpha = age > 1700 ? 1 - (age - 1700) / 500 : 1;
      ctx.font = "14px system-ui";
      const w = ctx.measureText(S.toast.text).width + 30;
      ctx.fillStyle = "rgba(34,38,43,.95)";
      ctx.strokeStyle = "#3a4046";
      ctx.lineWidth = 1;
      ctx.fillRect(W / 2 - w / 2, 18, w, 36);
      ctx.strokeRect(W / 2 - w / 2 + 0.5, 18.5, w - 1, 35);
      ctx.fillStyle = "#e8e6e3";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(S.toast.text, W / 2, 37);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    }
  }
  if ((S.fx.length || S.toast) && S.requestFrame)
    requestAnimationFrame(S.requestFrame); // 动画期间逐帧重绘
}

export function drawCurrent(cv, S) {
  // 右侧面板的当前牌预览
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!S.G) return;
  const d =
    S.G.current ||
    (S.pending && S.G.board[S.pending] && S.G.board[S.pending].d);
  if (!d) return;
  const rot = S.G.current ? S.uiRot : 0;
  drawTile(ctx, 6, 6, cv.width - 12, Carc.rotated(d, rot));
}

function drawTile(ctx, px, py, s, rd) {
  const u = s / 4; // 4×4 子格 → 像素
  ctx.fillStyle = C.grass;
  ctx.fillRect(px, py, s, s);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, s, s);
  ctx.clip(); // 圆头笔触裁在地块内，接缝刚好对齐
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = C.roadEdge; // 浅棕描边一遍
  ctx.lineWidth = 0.9 * u;
  for (const seg of rd.roads) {
    roadPath4(ctx, px, py, u, seg);
    ctx.stroke();
  }
  ctx.strokeStyle = C.road; // 白色 0.6 格窄带（多臂岔口在中心融为一体）
  ctx.lineWidth = 0.6 * u;
  for (const seg of rd.roads) {
    roadPath4(ctx, px, py, u, seg);
    ctx.stroke();
  }
  if (rd.roads.filter((s) => s.length === 1).length >= 3) house(ctx, px, py, u); // 三岔/十字路口中心小屋
  for (const seg of rd.cities) cityShape(ctx, px, py, u, seg); // 城后画：盖住交叠（尽头路止于城脚、贯通带跨路成桥）
  if (rd.cl) chapel(ctx, px, py, u);
  if (rd.p && rd.cities.length) pennant(ctx, px, py, u, rd.cities[0]);
  ctx.restore();
  ctx.strokeStyle = C.grid; // 白色细边，与网格线一体
  ctx.lineWidth = Math.max(1.5, s * 0.035);
  ctx.strokeRect(px, py, s, s);
}

function cityShape(ctx, px, py, u, seg) {
  const { poly, rot } = cityPoly4(seg);
  const P = (p) => [px + p[0] * u, py + p[1] * u];
  ctx.beginPath();
  poly
    .map((p) => rp4(p, rot))
    .forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
  ctx.closePath();
  ctx.fillStyle = C.wall;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(1.5, u * 0.12);
  ctx.stroke();
}

function house(ctx, px, py, u) {
  // 三岔/十字路口中心小房子
  const X = (x) => px + x * u,
    Y = (y) => py + y * u;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(1, u * 0.08);
  ctx.lineJoin = "round";
  ctx.fillStyle = C.road;
  ctx.fillRect(X(1.7), Y(2.0), 0.6 * u, 0.5 * u);
  ctx.strokeRect(X(1.7), Y(2.0), 0.6 * u, 0.5 * u);
  ctx.fillStyle = C.roadEdge;
  ctx.beginPath();
  ctx.moveTo(X(1.58), Y(2.0));
  ctx.lineTo(X(2), Y(1.6));
  ctx.lineTo(X(2.42), Y(2.0));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function chapel(ctx, px, py, u) {
  // 中央 2×2 粉顶小庙宇
  const X = (x) => px + x * u,
    Y = (y) => py + y * u;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(1.5, u * 0.1);
  ctx.lineJoin = "round";
  ctx.fillStyle = C.base;
  ctx.fillRect(X(1.5), Y(2.0), 1.0 * u, 0.85 * u);
  ctx.strokeRect(X(1.5), Y(2.0), 1.0 * u, 0.85 * u);
  ctx.fillStyle = C.roof;
  ctx.beginPath();
  ctx.moveTo(X(1.25), Y(2.0));
  ctx.lineTo(X(2.75), Y(2.0));
  ctx.lineTo(X(2), Y(1.2));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function pennant(ctx, px, py, u, seg) {
  // 1×1 蓝盾，锚点随城段类别
  const { rot } = cityPoly4(seg);
  const n = seg.length;
  const adj =
    (idx4(seg[0]) + 1) % 4 === idx4(seg[1]) ||
    (idx4(seg[1]) + 1) % 4 === idx4(seg[0]);
  const a =
    n === 1 ? [2, 0.5] : n === 2 ? (adj ? [2.8, 1.2] : [2, 1]) : [2, 0.5];
  const [ax, ay] = rp4(a, rot);
  const fx = px + ax * u,
    fy = py + ay * u;
  const r = 0.38 * u;
  ctx.beginPath();
  ctx.moveTo(fx - r, fy - r);
  ctx.lineTo(fx + r, fy - r);
  ctx.lineTo(fx + r, fy + 0.25 * r);
  ctx.quadraticCurveTo(fx, fy + 1.5 * r, fx - r, fy + 0.25 * r);
  ctx.closePath();
  ctx.fillStyle = C.shield;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(1, u * 0.06);
  ctx.stroke();
}
