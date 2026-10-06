// 引擎自检：落子合法性/旋转、城/路/修道院计分、跟随者收回、弃牌、终局计分。node test-game.js
const assert = require("assert");
const main = async () => {
  const C = (await import("./src/game.mjs")).default;

  const deckTiles = C.makeDeck();
  const byEdges = (s) =>
    deckTiles.find((t) => t.e.join("") === s && !t.cl && !t.p);

  // —— 旋转 ——
  assert.deepEqual(
    C.rotated({ e: ["C", "R", "F", "R"], cities: [["N"]], roads: [] }, 1).e,
    ["R", "C", "R", "F"],
  );
  assert.deepEqual(
    C.rotated({ e: ["C", "R", "F", "R"], cities: [["N"]], roads: [] }, 1)
      .cities,
    [["E"]],
  );

  // —— 新局 ——
  const G = C.newGame(deckTiles.slice());
  assert.deepEqual(G.board["0,0"].d.e, ["C", "R", "F", "R"]); // 起始牌：北城东西路
  assert.equal(G.deck.length, 71);

  // —— 非法落子：边不匹配 / 不相邻 ——
  const cityT = byEdges("CFFF");
  assert.equal(C.canPlace(G, 0, 1, cityT, 0), false); // 北边 C 对起始牌南边 F
  assert.equal(C.canPlace(G, 5, 5, cityT, 0), false); // 不相邻
  assert.equal(C.canPlace(G, 0, 0, cityT, 0), false); // 已占用
  assert.equal(C.canPlace(G, 0, -1, cityT, 2), true); // 转 180° 后南边是城，对上起始牌北城

  // —— 城封口计分：2 张城 ×2 分，跟随者当场收回 ——
  G.current = cityT;
  let key = C.placeTile(G, 0, -1, 2);
  C.endMove(G, key, { k: "C", i: 0 });
  assert.equal(G.scores[0], 4);
  assert.equal(G.meeplesLeft[0], 7);
  assert.equal(G.turn, 1);
  assert.equal(G.scored.length, 1);

  // —— 路封口：起始牌东西路 + 直路（放跟随者）+ 两端三岔口收头，4 张牌 +4 分 ——
  const straight = byEdges("RFRF");
  const junc4 = byEdges("RRRR");
  const junc3 = byEdges("RRRF");
  G.turn = 0;
  G.current = straight;
  key = C.placeTile(G, 1, 0, 1);
  C.endMove(G, key, { k: "R", i: 0 });
  assert.equal(G.meeplesLeft[0], 6);
  G.turn = 0;
  G.current = junc4;
  key = C.placeTile(G, 2, 0, 0);
  C.endMove(G, key, null);
  assert.equal(G.scores[0], 4); // 西端还开着，不计分
  G.turn = 0;
  G.current = junc3;
  key = C.placeTile(G, -1, 0, 1); // 转后东边是路，接起始牌西门
  C.endMove(G, key, null);
  assert.equal(G.scores[0], 8); // 路完成：4 张牌 +4
  assert.equal(G.meeplesLeft[0], 7); // 跟随者收回
  assert.equal(G.scored.length, 2);

  // —— 纹章：贯通城（带盾）+ 小城盖帽封口 → 3 城 ×2 + 盾 ×2 ——
  const G4 = C.newGame(deckTiles.slice(0, 4)); // 非空牌堆，避免空堆终局干扰
  G4.current = deckTiles.find(
    (t) => t.e.join("") === "CFCF" && t.p && t.cities[0].length === 2,
  );
  key = C.placeTile(G4, 0, -1, 0); // 南城边接起始牌北城，北向暂开口
  C.endMove(G4, key, { k: "C", i: 0 });
  assert.equal(G4.scores[0], 0); // 未封口不计分
  G4.turn = 0;
  G4.current = deckTiles.find((t) => t.e.join("") === "CFFF" && !t.p);
  key = C.placeTile(G4, 0, -2, 2); // 其南城边接贯通城北城边 → 封口
  C.endMove(G4, key, null);
  assert.equal(G4.scores[0], 8); // 3 城 ×2 + 1 盾 ×2

  // —— 修道院：8 邻齐 → 9 分 ——
  const field = {
    e: ["F", "F", "F", "F"],
    cities: [],
    roads: [],
    cl: false,
    p: false,
  };
  const G2 = {
    board: {},
    turn: 0,
    scores: [0, 0],
    meeplesLeft: [6, 7],
    meeples: [{ node: "0,0|M0", seat: 0 }],
    scored: [],
    over: false,
    current: null,
    log: [],
    deck: [],
  };
  G2.board["0,0"] = { d: { ...field, cl: true }, rot: 0 };
  for (const [dx, dy] of [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ])
    G2.board[`${dx},${dy}`] = { d: field, rot: 0 };
  C.scorePass(G2);
  assert.equal(G2.scores[0], 9);
  assert.equal(G2.meeplesLeft[0], 7);
  C.scorePass(G2); // scored 表防重复计分
  assert.equal(G2.scores[0], 9);

  // —— 弃牌 + 牌堆空终局：全城牌放不进当前棋盘 ——
  G.deck = [deckTiles.find((t) => t.e.join("") === "CCCC")];
  assert.equal(C.turnStart(G), false);
  assert.equal(G.over, true);
  assert.equal(G.deck.length, 0);
  assert.equal(G.current, null);

  // —— 终局计分：未封口的城带跟随者 = 1 分/张 ——
  const G3 = C.newGame([]);
  const cornerCity = deckTiles.find(
    (t) => t.e.join("") === "CCFF" && !t.cl && !t.p && t.cities[0].length === 2,
  ); // 连通角城（区别于相邻两边城 I 面）
  G3.current = cornerCity;
  key = C.placeTile(G3, 0, -1, 2); // 南边接城，西边开口 → 未完成
  C.endMove(G3, key, { k: "C", i: 0 });
  assert.equal(G3.over, true); // 牌堆空 → endMove 即终局
  assert.equal(G3.scores[0], 2); // 未完成城：城跨 2 张牌 ×1 分
  assert.equal(G3.meeplesLeft[0], 6); // 终局计分不回收跟随者（对局已结束）
  C.turnStart(G3);
  assert.equal(G3.over, true);
  assert.equal(G3.scores[0], 2);

  console.log("ok: 旋转/合法性/城路修道院计分/弃牌/终局计分 全部通过");
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
