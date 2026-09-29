<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardData } from '../../dashboardData.ts';

const props = defineProps<{ data: DashboardData }>();

type Tone = 'ink' | 'teal' | 'amber' | 'green' | 'rust';

const TONE_CLASS: Readonly<Record<Tone, string>> = {
  ink: 'text-ink',
  teal: 'text-teal',
  amber: 'text-amber',
  green: 'text-green',
  rust: 'text-rust',
};

const stats = computed(() => {
  const d = props.data;
  const missing = d.people - d.submittedToday;
  const items = d.origins.added + d.origins.assigned;
  const addedPct = items ? Math.round((d.origins.added / items) * 100) : 0;
  const logged = d.dailyCounts.reduce((sum, day) => sum + day.count, 0);
  const list: { label: string; value: string; tone: Tone }[] = [
    { label: 'submitted today', value: `${d.submittedToday}/${d.people}`, tone: missing > 0 ? 'amber' : 'green' },
    { label: 'missing today', value: String(missing), tone: missing > 0 ? 'rust' : 'green' },
    { label: 'manually added', value: `${addedPct}%`, tone: 'teal' },
    { label: `logged, last ${d.dailyCounts.length}d`, value: String(logged), tone: 'ink' },
  ];
  return list;
});
</script>

<template>
  <div class="grid grid-cols-2 border border-rule md:grid-cols-4">
    <div
      v-for="stat in stats"
      :key="stat.label"
      class="border-rule px-5 py-4.5 not-last:border-r max-md:nth-2:border-r-0 max-md:nth-[-n+2]:border-b"
    >
      <div class="font-mono text-[26px] font-medium" :class="TONE_CLASS[stat.tone]" data-test="stat-value">
        {{ stat.value }}
      </div>
      <div class="mt-1 text-[12.5px] text-ink-muted">{{ stat.label }}</div>
    </div>
  </div>
</template>
