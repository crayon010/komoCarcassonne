// 房间全流程自检：建房→加入→转发→快照→重连。node test.js
const assert = require("assert");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const PORT = 3123 + (process.pid % 100); // 避开上一轮测试还没释放干净的端口
const srv = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT },
  stdio: "inherit",
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = () =>
  new Promise((r) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on("open", () => r(ws));
  });
const next = (ws) =>
  new Promise((r) => ws.once("message", (m) => r(JSON.parse(m))));

(async () => {
  await wait(500);
  const a = await connect(),
    b = await connect();

  a.send('{"type":"create"}');
  const created = await next(a);
  assert.equal(created.type, "created");
  assert.match(created.room, /^[0-9A-F]{4}$/);

  b.send(JSON.stringify({ type: "join", room: created.room }));
  assert.equal((await next(b)).type, "joined");
  assert.equal((await next(a)).type, "start");
  assert.equal((await next(b)).type, "start");

  a.send('{"type":"move","data":{"tile":"A"}}');
  assert.deepEqual((await next(b)).data, { tile: "A" });

  a.send('{"type":"snapshot","data":{"tiles":["A"]}}');
  b.close();
  assert.equal((await next(a)).type, "opponent_left");

  const b2 = await connect();
  b2.send(JSON.stringify({ type: "join", room: created.room }));
  assert.equal((await next(b2)).type, "joined");
  assert.deepEqual((await next(b2)).data, { tiles: ["A"] }); // 重连拿到快照
  assert.equal((await next(a)).type, "start");

  console.log("ok: 建房/加入/转发/快照重连 全部通过");
  srv.kill();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  srv.kill();
  process.exit(1);
});
