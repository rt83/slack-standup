<script setup lang="ts">
import { computed } from 'vue';
import { SECTIONS, SECTION_TITLES } from '../../../standup/types.ts';
import type { DashboardSubmission } from '../../dashboardData.ts';
import { formatSubmittedAt, plural } from '../format.ts';

const props = defineProps<{ submission: DashboardSubmission; index: number; timeZone: string }>();

// Row numbers are meaningful here: this is a sequential log.
const rowNumber = computed(() => String(props.index + 1).padStart(3, '0'));
const time = computed(() => formatSubmittedAt(props.submission.submittedAt, props.timeZone));
const sections = computed(() =>
  SECTIONS.map((section) => ({
    section,
    title: SECTION_TITLES[section],
    items: props.submission.items.filter((item) => item.section === section),
  })).filter((s) => s.items.length)
);
</script>

<template>
  <details class="group border-b border-rule last:border-b-0">
    <summary
      class="grid cursor-pointer list-none grid-cols-[30px_1fr] items-center gap-3 px-5 py-3 text-sm hover:bg-teal/5 md:grid-cols-[40px_1fr_150px_90px] [&::-webkit-details-marker]:hidden"
    >
      <span class="row-span-2 font-mono text-xs text-ink-muted md:row-span-1">{{ rowNumber }}</span>
      <span class="font-medium">{{ submission.person.displayName }}</span>
      <span class="font-mono text-[12.5px] text-ink-muted">{{ time }}</span>
      <span class="hidden text-right text-[12.5px] text-ink-muted md:block">
        {{ plural(submission.items.length, 'issue') }}
      </span>
    </summary>

    <div class="px-5 pt-1 pb-4.5 md:pl-18">
      <div v-for="group in sections" :key="group.section">
        <h4 class="mt-2.5 mb-1.5 text-xs font-semibold text-ink-muted">{{ group.title }}</h4>
        <ul>
          <li
            v-for="item in group.items"
            :key="`${item.section}-${item.issueId}`"
            class="border-t border-rule py-2 text-[13.5px] first:border-t-0"
            :class="item.origin === 'added' && '-ml-3 border-l-2 border-l-amber pl-2.5'"
          >
            <span class="mr-2 font-mono text-teal">#{{ item.issueId }}</span>
            <span class="mr-2 text-[11.5px] text-ink-muted">{{ item.section }}</span>
            <span
              class="mr-1.5 border px-1.5 py-px text-[10.5px]"
              :class="item.origin === 'added' ? 'border-amber text-amber' : 'border-rule text-ink-muted'"
            >
              {{ item.origin }}
            </span>
            <span v-if="item.newStatusId !== null" class="ml-1.5 font-mono text-xs text-ink-muted">
              → status {{ item.newStatusId }}
            </span>
            <span v-if="!item.syncedToRedmine" class="ml-1.5 border border-rust px-1.5 py-px text-[10.5px] text-rust">
              redmine sync failed
            </span>
            <div class="mt-1 whitespace-pre-line text-ink" data-test="notes">{{ item.notes }}</div>
          </li>
        </ul>
      </div>
    </div>
  </details>
</template>
