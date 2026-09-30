<script setup lang="ts">
import type { DashboardPerson } from '../../dashboardData.ts';

defineProps<{ people: readonly DashboardPerson[] }>();
</script>

<template>
  <ul v-if="people.length">
    <li
      v-for="person in people"
      :key="person.slackUserId"
      class="flex justify-between border-b border-rule py-1.5 text-sm last:border-b-0"
    >
      {{ person.displayName }}
      <span class="text-xs text-rust">not submitted</span>
    </li>
  </ul>
  <p v-else class="text-sm text-green">Everyone's submitted today.</p>
</template>
