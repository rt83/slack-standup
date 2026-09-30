/**
 * The JSON contract between the dashboard API and the Vue client. The server builds a
 * `DashboardData`; the client parses the response with `dashboardDataSchema`. Both come
 * from the one schema below, so the contract cannot drift. The client bundles this file:
 * it must stay free of Node-only imports.
 */

import { z } from 'zod';
import { ISSUE_ORIGINS, SECTIONS } from '../standup/types.ts';

export const DASHBOARD_API_PATH = '/api/dashboard';
export const DASHBOARD_PAGE_PATH = '/dashboard';
/** Query parameter, on both the page and the API, naming the one person to show. */
export const USER_PARAM = 'user';
/** Query parameter, on both the page and the API, setting the trend window in days. */
export const DAYS_PARAM = 'days';

const personSchema = z.object({
  slackUserId: z.string(),
  displayName: z.string(),
});

const itemSchema = z.object({
  section: z.enum(SECTIONS),
  issueId: z.number(),
  origin: z.enum(ISSUE_ORIGINS),
  notes: z.string(),
  newStatusId: z.number().nullable(),
  syncedToRedmine: z.boolean(),
});

const submissionSchema = z.object({
  id: z.number(),
  person: personSchema,
  /** ISO 8601, UTC. */
  submittedAt: z.iso.datetime(),
  items: z.array(itemSchema).readonly(),
});

const dayCountSchema = z.object({
  /** `YYYY-MM-DD` in the team's time zone. */
  day: z.string(),
  count: z.number(),
});

/** The team view lists who is missing today; the personal view shows issue composition instead. */
const focusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('team'), missingToday: z.array(personSchema).readonly() }),
  z.object({ kind: z.literal('person'), person: personSchema }),
]);

export const dashboardDataSchema = z.object({
  focus: focusSchema,
  /** IANA zone the team's days are counted in; timestamps are shown in it. */
  timeZone: z.string(),
  submittedToday: z.number(),
  people: z.number(),
  /** Oldest first, one entry per day of the trend window. */
  dailyCounts: z.array(dayCountSchema).readonly(),
  origins: z.object({ assigned: z.number(), added: z.number() }),
  /** Newest first. */
  submissions: z.array(submissionSchema).readonly(),
});

export type DashboardPerson = z.infer<typeof personSchema>;
export type DashboardItem = z.infer<typeof itemSchema>;
export type DashboardSubmission = z.infer<typeof submissionSchema>;
export type DashboardFocus = z.infer<typeof focusSchema>;
export type DashboardData = z.infer<typeof dashboardDataSchema>;

/** The API's error body. */
export const dashboardErrorSchema = z.object({ error: z.string() });
