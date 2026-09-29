<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { loadDashboard, type DashboardLoad } from './dashboardApi.ts';
import MissingList from './components/MissingList.vue';
import OriginChart from './components/OriginChart.vue';
import StatStrip from './components/StatStrip.vue';
import SubmissionLog from './components/SubmissionLog.vue';
import TrendChart from './components/TrendChart.vue';

const load = ref<DashboardLoad>({ kind: 'loading' });

const scopeLabel = computed(() =>
  load.value.kind === 'ready' && load.value.data.focus.kind === 'person'
    ? load.value.data.focus.person.displayName
    : 'All updates'
);

onMounted(async () => {
  load.value = await loadDashboard(window.location.search);
  document.title = `Daily Log — ${scopeLabel.value}`;
});
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 pt-10 pb-20">
    <header class="mb-7 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-5">
      <h1 class="text-[22px] font-semibold">Daily Log</h1>
      <div class="text-sm text-ink-muted">{{ scopeLabel }}</div>
    </header>

    <p v-if="load.kind === 'loading'" class="py-10 text-center text-ink-muted">Loading…</p>

    <p v-else-if="load.kind === 'failed'" role="alert" class="border border-rust bg-panel px-5 py-4 text-rust">
      {{ load.message }}
    </p>

    <template v-else>
      <StatStrip :data="load.data" class="mb-7" />

      <div class="mb-8 grid gap-5 md:grid-cols-[2fr_1fr]">
        <section class="border border-rule bg-panel p-5">
          <h3 class="mb-3.5 text-[13px] font-semibold text-ink-muted">
            Submissions, last {{ load.data.dailyCounts.length }} days
          </h3>
          <TrendChart :daily-counts="load.data.dailyCounts" />
        </section>
        <section class="border border-rule bg-panel p-5">
          <template v-if="load.data.focus.kind === 'team'">
            <h3 class="mb-3.5 text-[13px] font-semibold text-ink-muted">Missing today</h3>
            <MissingList :people="load.data.focus.missingToday" />
          </template>
          <template v-else>
            <h3 class="mb-3.5 text-[13px] font-semibold text-ink-muted">Issue composition</h3>
            <OriginChart :origins="load.data.origins" />
          </template>
        </section>
      </div>

      <SubmissionLog :submissions="load.data.submissions" :time-zone="load.data.timeZone" />
    </template>
  </div>
</template>
