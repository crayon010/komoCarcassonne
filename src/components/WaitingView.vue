<script setup>
import { S, inviteLink } from "../composables/useGame.js";
</script>

<template>
  <div class="card">
    <p>
      房间码：<b class="roomCode">{{ S.room }}</b>
    </p>
    <p>把邀请链接发给朋友：</p>
    <input :value="inviteLink" readonly style="width: 260px" />
  </div>
</template>
