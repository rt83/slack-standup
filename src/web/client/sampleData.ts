import type { DashboardData } from '../dashboardData.ts';

/** A small, valid response for the client tests. */
export const sampleData: DashboardData = {
  focus: { kind: 'team', missingToday: [{ slackUserId: 'UBOB', displayName: 'Bob' }] },
  timeZone: 'UTC',
  submittedToday: 1,
  people: 2,
  dailyCounts: [
    { day: '2026-09-28', count: 0 },
    { day: '2026-09-29', count: 1 },
  ],
  origins: { assigned: 3, added: 1 },
  submissions: [
    {
      id: 1,
      person: { slackUserId: 'UJANE', displayName: 'Jane' },
      submittedAt: '2026-09-29T02:05:00.000Z',
      items: [
        { section: 'did', issueId: 12, origin: 'added', notes: '<b>not bold</b>', newStatusId: 5, syncedToRedmine: false },
      ],
    },
  ],
};
