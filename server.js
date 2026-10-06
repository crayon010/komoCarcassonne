// 只做两件事：托管 public/ 静态文件 + 房间管理和消息转发。游戏规则全在客户端。
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  // /tiles/* 来自项目根 tiles/（CogView 素材，vite build 清不掉），其余来自 public/
  const base = url.startsWith("/tiles/") ? "tiles" : "public";
  const rel =
    base === "tiles"
      ? url.slice("/tiles/".length)
      : url === "/"
        ? "/index.html"
        : url;
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) return res.writeHead(404).end();
  // module script 对 MIME 严格校验，必须按扩展名给全类型
  const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };
  res.setHeader(
    "Content-Type",
    MIME[path.extname(file)] || "application/octet-stream",
  );
  if (path.extname(file) === ".html")
    res.setHeader("Cache-Control", "no-cache"); // 构建产物 hash 命名，入口页必须每次重新取
  try {
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // 房间码 -> { players: [ws|null, ws|null], snapshot }

function makeCode() {
  let c;
  do {
    c = crypto.randomBytes(2).toString("hex").toUpperCase();
  } while (rooms.has(c));
  return c;
}
function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  let roomId = null,
    seat = -1;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const room = rooms.get(roomId);

    switch (msg.type) {
      case "create": {
        const id = makeCode();
        rooms.set(id, { players: [ws, null], snapshot: null });
        roomId = id;
        seat = 0;
        send(ws, { type: "created", room: id });
        break;
      }
      case "join": {
        const target = rooms.get(msg.room);
        if (!target) return send(ws, { type: "error", message: "房间不存在" });
        // 空位优先复用，顺带实现断线重连
        const free = target.players.findIndex((p) => !p || p.readyState !== 1);
        if (free === -1)
          return send(ws, { type: "error", message: "房间已满" });
        target.players[free] = ws;
        roomId = msg.room;
        seat = free;
        send(ws, { type: "joined", room: msg.room, seat: free });
        if (target.players.every((p) => p && p.readyState === 1)) {
          if (target.snapshot)
            send(ws, { type: "snapshot", data: target.snapshot });
          target.players.forEach((p) => send(p, { type: "start" }));
        }
        break;
      }
      case "move": // 不校验规则，只转发给对面；要防作弊再在这里查快照
        if (room)
          room.players.forEach((p) => {
            if (p !== ws) send(p, { type: "opponent_move", data: msg.data });
          });
        break;
      case "snapshot": // 每步后由行动方上报完整棋盘：存档供重连 + 转发给对面（对面全量重建，单一状态同步路径）
        if (room) {
          room.snapshot = msg.data;
          room.players.forEach((p) => {
            if (p !== ws) send(p, { type: "snapshot", data: msg.data });
          });
        }
        break;
      case "restart": // 再来一次：清空存档并通知双方重置
        if (room) {
          room.snapshot = null;
          room.players.forEach((p) => send(p, { type: "restart" }));
        }
        break;
    }
  });

  ws.on("close", () => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.players[seat] = null;
    room.players.forEach((p) => send(p, { type: "opponent_left" }));
    if (room.players.every((p) => !p)) rooms.delete(roomId);
  });
});

// ponytail: 无心跳，手机锁屏断网感知不到；要加就 30s ping/pong 或换 socket.io
server.listen(process.env.PORT || 3000, () =>
  console.log("http://localhost:" + (process.env.PORT || 3000)),
);
