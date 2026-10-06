<script setup>
import { ref, computed, watchEffect, onMounted, onBeforeUnmount } from "vue";
import {
  S,
  status,
  logText,
  myTurn,
  oppName,
  finishMove,
  undoPlace,
  rotate,
  restartGame,
  leaveToLobby,
  cvClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheel,
  bump,
} from "../composables/useGame.js";
import { drawBoard, drawCurrent } from "../draw.mjs";

const cv = ref(null);
const cur = ref(null);

const scoreRows = computed(() => [
  { cls: "me", name: "你", pts: S.G ? S.G.scores[S.mySeat] : 0, mp: S.G ? S.G.meeplesLeft[S.mySeat] : 7 },
  {
    cls: "other",
    name: oppName.value,
    pts: S.G ? S.G.scores[1 - S.mySeat] : 0,
    mp: S.G ? S.G.meeplesLeft[1 - S.mySeat] : 7,
  },
]);

const barPos = computed(() => {
  // 动作条锚定在所放碎片正下方
  if (S.phase !== "meeple" || !S.pending || !S.view) return null;
  const [tx, ty] = S.pending.split(",").map(Number);
  const { ox, oy, cell } = S.view;
  return {
    left: Math.round(ox + (tx + 0.5) * cell) + "px",
    top:
      Math.min(Math.round(oy + (ty + 1) * cell + 10), window.innerHeight - 58) +
      "px",
  };
});

const verdict = computed(() => {
  // 游戏结束弹框：WIN / LOSE / DRAW
  if (!S.G || !S.G.over) return null;
  const you = S.G.scores[S.mySeat],
    opp = S.G.scores[1 - S.mySeat];
  return you > opp ? "WIN" : you < opp ? "LOSE" : "DRAW";
});

watchEffect(() => {
  S.tick; // 窗口尺寸/动画帧变化时触发重绘
  if (cv.value) drawBoard(cv.value, S);
  if (cur.value) drawCurrent(cur.value, S);
});

function onKey(e) {
  if (e.key === "r" || e.key === "R") rotate();
}
function onResize() {
  sizeCanvas();
  bump();
}
function sizeCanvas() {
  if (!cv.value) return;
  cv.value.width = window.innerWidth;
  cv.value.height = window.innerHeight;
  bump();
}
onMounted(() => {
  sizeCanvas();
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="game">
    <canvas ref="cv" @mousemove="onMouseMove" @mousedown="onMouseDown" @mouseup="onMouseUp" @mouseleave="onMouseLeave"
      @wheel.prevent="onWheel" @contextmenu.prevent="rotate"></canvas>
    <button class="rotBtn" @click="leaveToLobby">回到首页</button>

    <div class="panels">
      <div class="panel">
        <div class="panelTitle">记分板</div>
        <div class="scoreRow" v-for="r2 in scoreRows" :key="r2.name">
          <span class="dot" :class="r2.cls"></span>{{ r2.name }}
          <span class="mp">跟随 {{ r2.mp }}/7</span>
          <b class="pts">{{ r2.pts }}</b>
        </div>
        <div class="sub">
          {{
            S.solo
              ? "难度 " + ["简单", "普通", "困难"][S.difficulty] + " · "
              : ""
          }} 牌堆
          {{ S.G ? S.G.deck.length : 71 }}
        </div>
      </div>
      <div class="panel">
        <div class="panelTitle">当前行动</div>
        <div class="turnRow">
          <span class="dot" :class="myTurn ? 'me' : 'other'"></span>{{ status }}
        </div>
        <canvas id="cur" ref="cur" width="132" height="132"></canvas>
      </div>
      <div class="panel">
        <div class="panelTitle">Log</div>
        <div class="log">{{ logText }}</div>
      </div>
    </div>

    <div class="actionBar" v-if="barPos" :style="barPos">
      <button class="skipBtn" @click="finishMove(null)">Skip</button>
      <button class="undoBtn" title="撤销当前碎片放置" @click="undoPlace">
        ↩
      </button>
    </div>

    <div class="overModal" v-if="verdict">
      <div class="overCard">
        <div class="verdict" :class="verdict">{{ verdict }}</div>
        <div class="finalScores">
          <span class="dot me"></span>你 <b>{{ S.G.scores[S.mySeat] }}</b>
          <span class="vs">:</span>
          <b>{{ S.G.scores[1 - S.mySeat] }}</b> {{ oppName }}
          <span class="dot other"></span>
        </div>
        <button class="againBtn" @click="restartGame">再来一次</button>
      </div>
    </div>
  </div>
</template>
