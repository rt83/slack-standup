<script setup lang="ts">
import type { DashboardSubmission } from '../../dashboardData.ts';
import SubmissionRow from './SubmissionRow.vue';

defineProps<{ submissions: readonly DashboardSubmission[]; timeZone: string }>();
</script>

<template>
  <div class="border border-rule bg-panel">
    <SubmissionRow
      v-for="(submission, index) in submissions"
      :key="submission.id"
      :submission="submission"
      :index="index"
      :time-zone="timeZone"
    />
    <p v-if="!submissions.length" class="px-5 py-10 text-center text-ink-muted">No submissions yet.</p>
  </div>
</template>
