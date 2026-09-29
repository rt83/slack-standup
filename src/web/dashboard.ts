import type { SubmissionStore } from '../lib/submissionStore.ts';
import type { LinkedUser, UserStore } from '../lib/userStore.ts';
import type { DashboardData, DashboardPerson } from './dashboardData.ts';

export const DEFAULT_TREND_DAYS = 14;
export const MAX_TREND_DAYS = 90;
const LOG_LIMIT = 50;

/** Whose updates the dashboard shows. */
export type DashboardScope = { readonly kind: 'team' } | { readonly kind: 'person'; readonly slackUserId: string };

/** Assembles the dashboard's data from the user and submission stores. */
export class DashboardService {
  readonly #users: Pick<UserStore, 'list'>;
  readonly #submissions: Pick<SubmissionStore, 'submittersToday' | 'dailyCounts' | 'originCounts' | 'recent'>;
  readonly #timeZone: string;

  constructor(
    users: Pick<UserStore, 'list'>,
    submissions: Pick<SubmissionStore, 'submittersToday' | 'dailyCounts' | 'originCounts' | 'recent'>,
    timeZone: string
  ) {
    this.#users = users;
    this.#submissions = submissions;
    this.#timeZone = timeZone;
  }

  /** The data for `scope`, or null when it names a person who is not linked. */
  build(scope: DashboardScope, trendDays: number): DashboardData | null {
    const users = this.#users.list();
    const personId = scope.kind === 'person' ? scope.slackUserId : null;
    const person = personId === null ? undefined : users.find((u) => u.slackUserId === personId);
    if (personId !== null && !person) return null;

    const inScope = person ? [person] : users;
    const submitted = this.#submissions.submittersToday();
    const byId = new Map(users.map((u) => [u.slackUserId, toPerson(u)]));

    return {
      focus: person
        ? { kind: 'person', person: toPerson(person) }
        : { kind: 'team', missingToday: users.filter((u) => !submitted.has(u.slackUserId)).map(toPerson) },
      timeZone: this.#timeZone,
      submittedToday: inScope.filter((u) => submitted.has(u.slackUserId)).length,
      people: inScope.length,
      dailyCounts: this.#submissions.dailyCounts(trendDays, personId),
      origins: this.#submissions.originCounts(personId),
      submissions: this.#submissions.recent(LOG_LIMIT, personId).map((s) => ({
        id: s.id,
        person: byId.get(s.slackUserId) ?? { slackUserId: s.slackUserId, displayName: s.slackUserId },
        submittedAt: s.submittedAt.toISOString(),
        items: s.items,
      })),
    };
  }
}

/** Only what the page shows: never the API key. */
function toPerson(user: LinkedUser): DashboardPerson {
  return { slackUserId: user.slackUserId, displayName: user.displayName };
}
