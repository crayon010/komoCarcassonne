# 卡卡颂（Carcassonne）网页版

浏览器卡卡颂：**单机对弈机器人**（支持简单 / 普通 / 困难三档难度）。极简扁平矢量画风，无任何素材文件——所有砖面由 Canvas 按 4×4 子格规范实时绘制。

> 当前版本仅支持单机模式；联机对战的房间与同步代码已就绪（`ONLINE` 开关与 `server.js`），暂未开放入口。

<img width="1640" height="1032" alt="image" src="https://github.com/user-attachments/assets/8a00054a-6008-49e8-becf-b718d2ca2f42" />
<img width="1640" height="1032" alt="image" src="https://github.com/user-attachments/assets/e6eb8a43-09fd-414f-967d-4ffa64aa7ba2" />


## 运行

```bash
npm install
npm start          # 构建并起服务器 http://localhost:3000
npm run dev        # 前端开发模式（Vite，需另起 node server.js）
npm test           # 引擎自检 + 房间流程测试
```

构建产物是单文件 `public/index.html`（JS/CSS 全内联）：双击即可单机游玩，挂任何静态托管也行；只有联机对战需要 `node server.js`。

## 玩法（与原版一致）

轮流摸一块砖放到桌面上，边对边相连（路对路、城对城、草对草）；可放一名跟随者到城/路/修道院上，地块完成即得分，游戏结束时未完成的按规则折算计分，分高者胜。

操作：碎片跟随鼠标（合法绿框 / 非法红框），**左键**放置，**右键 / R** 旋转；放置后点击砖上的**白圈**放跟随者（灰圈表示该区域已被占用），或 **Skip** 跳过、**↩** 撤销本次放置。拖拽平移桌面，滚轮缩放。结束时弹出 WIN / LOSE / DRAW 与比分，可“再来一次”。

## 机器人难度

- **简单**：随机合法位置，偶尔放跟随者。
- **普通**：克隆整局试放所有合法位 × 跟随者选项，取（机器得分 − 对手得分）最高。
- **困难**：在普通基础上额外权衡双方在场跟随者所在连通段的潜在价值——会持续经营自己的高价值地块，同时避免给你送分。

## 联机模式（暂未开放）

房间与同步逻辑已完整实现：`server.js`（Node + ws：静态托管、房间、消息转发、断线重连快照）、`useGame.js` 的 WebSocket 同步路径、大厅的创建/加入入口。放开方式：`useGame.js` 中 `ONLINE` 改为 `true`，`npm start` 后即可通过邀请链接（`/?room=码`）双人在线。

## 结构

```
server.js               Node + ws：静态托管、房间、消息转发、断线重连快照
index.html / vite.config.js
src/
  game.mjs              规则引擎（纯逻辑，浏览器与 node 通用）：牌堆、落子合法性、
                        连通段合并、计分、机器人选位
  draw.mjs              Canvas 渲染：4×4 子格砖面几何、相机（拖拽/缩放）、得分特效
  composables/useGame.js 响应式状态 + WebSocket 同步 + 回合动作 + 机器人调度
  components/           GameView（对局）/ LobbyView / WaitingView
  style.css
test-game.js            引擎断言：旋转、合法性、计分、弃牌、终局
test.js                 房间流程：建房→加入→转发→快照重连
tiles/prompts.md        砖面 4×4 几何与牌面清单（渲染规范）
```

## 设计要点

- **规则全在客户端**，服务器只做房间与转发；行动方每步上报完整棋盘快照，对手与重连方全量重建——单一状态同步路径。
- **机器人三档难度**：简单随机走子；普通/困难克隆整局试放所有合法位 × 跟随者选项打分（困难额外权衡在场跟随者潜在价值）。
- 牌表与原版一致；已知裁剪：无农场（草地不计分）、无心跳重连探测。
