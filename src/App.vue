<script setup>
import { screen } from "./composables/useGame.js";
import LobbyView from "./components/LobbyView.vue";
import WaitingView from "./components/WaitingView.vue";
import GameView from "./components/GameView.vue";
</script>

<template>
  <LobbyView v-if="screen === 'lobby'" />
  <WaitingView v-else-if="screen === 'waiting'" />
  <!-- v-show：保持 canvas 挂载，绘图 watchEffect 随时可画 -->
  <GameView v-show="screen === 'game'" />
</template>
