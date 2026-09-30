<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js';
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import '../charts.ts';
import type { DashboardData } from '../../dashboardData.ts';
import { themeColor } from '../theme.ts';

const props = defineProps<{ dailyCounts: DashboardData['dailyCounts'] }>();

const data = computed<ChartData<'line'>>(() => ({
  labels: props.dailyCounts.map((d) => d.day.slice(5)), // MM-DD
  datasets: [
    {
      data: props.dailyCounts.map((d) => d.count),
      borderColor: themeColor('teal'),
      backgroundColor: `color-mix(in srgb, ${themeColor('teal')} 8%, transparent)`,
      fill: true,
      tension: 0.25,
      pointRadius: 2,
    },
  ],
}));

const options = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0, color: themeColor('ink-muted') }, grid: { color: themeColor('rule') } },
    x: { ticks: { color: themeColor('ink-muted') }, grid: { display: false } },
  },
}));
</script>

<template>
  <div class="h-56">
    <Line :data="data" :options="options" />
  </div>
</template>
