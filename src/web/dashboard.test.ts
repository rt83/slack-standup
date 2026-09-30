import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '../lib/calendar.ts';
import { openDatabase } from '../lib/db.ts';
import { SubmissionStore } from '../lib/submissionStore.ts';
import { UserStore } from '../lib/userStore.ts';
import { DashboardService } from './dashboard.ts';
import { dashboardDataSchema } from './dashboardData.ts';
import { dashboardUrl, readDashboardQuery } from './server.ts';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    const now = () => new Date('2026-09-29T03:00:00Z');
    const users = new UserStore(db);
    const submissions = new SubmissionStore(db, new Calendar('UTC', now));
    users.link({ slackUserId: 'UJANE', redmineUserId: 1, redmineApiKey: 'jane-secret-key', displayName: 'Jane' });
    users.link({ slackUserId: 'UBOB', redmineUserId: 2, redmineApiKey: 'bob-secret-key', displayName: 'Bob' });
    submissions.record({
      slackUserId: 'UJANE',
      auditPayload: {},
      reportText: 'r',
      entries: [{ section: 'did', issueId: 1, origin: 'added', notes: 'n', newStatusId: null }],
    });
    service = new DashboardService(users, submissions, 'UTC');
  });

  it('shows the team with who is missing today', () => {
    const data = service.build({ kind: 'team' }, 7);
    expect(data?.focus).toEqual({ kind: 'team', missingToday: [{ slackUserId: 'UBOB', displayName: 'Bob' }] });
    expect(data?.submittedToday).toBe(1);
    expect(data?.people).toBe(2);
    expect(data?.dailyCounts).toHaveLength(7);
    expect(data?.submissions[0]?.person.displayName).toBe('Jane');
  });

  it('scopes everything to one person', () => {
    const data = service.build({ kind: 'person', slackUserId: 'UBOB' }, 7);
    expect(data?.focus).toEqual({ kind: 'person', person: { slackUserId: 'UBOB', displayName: 'Bob' } });
    expect(data?.submittedToday).toBe(0);
    expect(data?.people).toBe(1);
    expect(data?.submissions).toEqual([]);
    expect(data?.origins).toEqual({ assigned: 0, added: 0 });
  });

  it('refuses a person who is not linked', () => {
    expect(service.build({ kind: 'person', slackUserId: 'UNOBODY' }, 7)).toBeNull();
  });

  it('sends data the client schema accepts, and never an API key', () => {
    const json = JSON.stringify(service.build({ kind: 'team' }, 7));
    expect(dashboardDataSchema.safeParse(JSON.parse(json)).success).toBe(true);
    expect(json).not.toContain('secret-key');
  });
});

describe('dashboard URLs', () => {
  it('builds the link Slack posts, and the server reads it back to the same scope', () => {
    const team = dashboardUrl('https://standup.example.com', { kind: 'team' });
    const jane = dashboardUrl('https://standup.example.com', { kind: 'person', slackUserId: 'UJANE' });
    expect(team).toBe('https://standup.example.com/dashboard');
    expect(jane).toBe('https://standup.example.com/dashboard?user=UJANE');
    expect(readDashboardQuery(Object.fromEntries(new URL(jane).searchParams)).scope).toEqual({
      kind: 'person',
      slackUserId: 'UJANE',
    });
    expect(readDashboardQuery({}).scope).toEqual({ kind: 'team' });
  });

  it('keeps the trend window between 1 and 90 days, defaulting to 14', () => {
    expect(readDashboardQuery({}).days).toBe(14);
    expect(readDashboardQuery({ days: '30' }).days).toBe(30);
    expect(readDashboardQuery({ days: '500' }).days).toBe(90);
    expect(readDashboardQuery({ days: '-3' }).days).toBe(1);
    expect(readDashboardQuery({ days: 'abc' }).days).toBe(14);
  });
});
