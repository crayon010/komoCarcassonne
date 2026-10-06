<script setup>
// 独立组件：软方块上两只眼睛跟随光标；光标移向方块外时，远侧眼缩小、整对眼倾斜（探头效果）
import { ref, onMounted, onBeforeUnmount } from "vue";

const box = ref(null);
const tilt = ref(0);
const farShrinkL = ref(false); // 左眼缩小（光标在右侧时）
const farShrinkR = ref(false); // 右眼缩小（光标在左侧时）
const lookL = ref({ x: 50, y: 50 });
const lookR = ref({ x: 50, y: 50 });
let raf = 0;
const st = { mx: -999, my: -999 };

function onMove(e) {
  st.mx = e.clientX;
  st.my = e.clientY;
  if (!raf) raf = requestAnimationFrame(apply);
}

function apply() {
  raf = 0;
  const el = box.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  const inside =
    st.mx >= r.left && st.mx <= r.right && st.my >= r.top && st.my <= r.bottom;

  // 目标点：块内=光标；块外=压到最近边上
  const tx = Math.max(r.left, Math.min(r.right, st.mx));
  const ty = Math.max(r.top, Math.min(r.bottom, st.my));

  const eyeAt = (ex, ey0) => {
    // 瞳孔看向目标方向（满幅，无距离衰减），并钳制在眼内范围
    const dx = tx - ex,
      dy = ty - ey0;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x: Math.max(28, Math.min(72, 50 + (dx / d) * 26)),
      y: Math.max(26, Math.min(70, 50 + (dy / d) * 40)),
    };
  };
  lookL.value = eyeAt(cx - r.width * 0.16, cy);
  lookR.value = eyeAt(cx + r.width * 0.16, cy);

  if (inside) {
    farShrinkL.value = farShrinkR.value = false;
    tilt.value = 0;
    return;
  }
  const side = st.mx < cx ? -1 : 1; // 光标在左 → 右眼远
  const outside = Math.min(
    1,
    Math.max(0, (Math.abs(st.mx - cx) - r.width * 0.5) / (r.width * 0.7)),
  );
  farShrinkL.value = side === 1; // 光标在右 → 左眼远
  farShrinkR.value = side === -1;
  tilt.value = side * Math.min(9, outside * 12);
}

onMounted(() => window.addEventListener("mousemove", onMove));
onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onMove);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="eyeBox" ref="box">
    <div class="eyePair" :style="{ transform: `rotate(${tilt}deg)` }">
      <div class="eye" :class="{ shrink: farShrinkL }">
        <div class="pupil" :style="{ left: lookL.x + '%', top: lookL.y + '%' }"></div>
      </div>
      <div class="eye" :class="{ shrink: farShrinkR }">
        <div class="pupil" :style="{ left: lookR.x + '%', top: lookR.y + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eyeBox {
  width: min(290px, 74vw);
  aspect-ratio: 1.4;
  border-radius: 28px;
  background: #f6f1e7;
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.55),
    inset 0 -7px 0 rgba(0, 0, 0, 0.07);
  position: relative;
  overflow: hidden;
  cursor: crosshair;
}

.eyePair {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15%;
  transition: transform 0.3s cubic-bezier(0.34, 1.45, 0.64, 1);
}

.eye {
  width: 27%;
  aspect-ratio: 0.8;
  background: #ffffff;
  border: 3px solid #1a1408;
  border-radius: 50% 50% 45% 45%;
  position: relative;
  overflow: hidden;
  transition: transform 0.26s cubic-bezier(0.34, 1.45, 0.64, 1);
}

.eye.shrink {
  transform: scaleY(0.58) scaleX(0.88);
}

.pupil {
  position: absolute;
  width: 44%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #1a1408;
  transform: translate(-50%, -50%);
  transition:
    left 0.1s ease-out,
    top 0.1s ease-out;
}
</style>
