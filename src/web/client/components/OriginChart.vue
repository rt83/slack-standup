<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js';
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import '../charts.ts';
import type { DashboardData } from '../../dashboardData.ts';
import { themeColor } from '../theme.ts';

const props = defineProps<{ origins: DashboardData['origins'] }>();

const data = computed<ChartData<'doughnut'>>(() => ({
  labels: ['Assigned', 'Manually added'],
  datasets: [
    {
      data: [props.origins.assigned, props.origins.added],
      backgroundColor: [themeColor('teal'), themeColor('amber')],
      borderWidth: 0,
    },
  ],
}));

const options = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { color: themeColor('ink-muted'), boxWidth: 12 } } },
}));
</script>

<template>
  <div class="h-56">
    <Doughnut :data="data" :options="options" />
  </div>
</template>
