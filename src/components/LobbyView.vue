<script setup>
import {
  code,
  ONLINE,
  createRoom,
  joinRoom,
  startSolo,
} from "../composables/useGame.js";
import EyeTracker from "./EyeTracker.vue";
const diffs = [
  ["简单", 0],
  ["普通", 1],
  ["困难", 2],
];
</script>

<template>
  <div class="card">
    <p class="eyebrow">Carcassonne · 单机对弈</p>
    <h1 style="cursor: pointer">卡卡颂</h1>
    <EyeTracker />
    <div class="diffRow">
      <button
        v-for="[name, d] in diffs"
        :key="name"
        :class="{ primary: d === 1 }"
        @click="startSolo(d)"
      >
        {{ name }}
      </button>
    </div>
    <template v-if="ONLINE">
      <hr />
      <button @click="createRoom">创建房间</button>
      <input
        v-model="code"
        placeholder="房间码"
        maxlength="4"
        style="text-transform: uppercase"
        @keyup.enter="joinRoom"
      />
      <button @click="joinRoom">加入</button>
    </template>
  </div>
</template>
