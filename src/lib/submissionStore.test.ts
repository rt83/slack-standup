import { beforeEach, describe, expect, it } from 'vitest';
import type { StandupEntry } from '../standup/types.ts';
import { Calendar } from './calendar.ts';
import { openDatabase } from './db.ts';
import { SubmissionStore } from './submissionStore.ts';

const entry = (overrides: Partial<StandupEntry> = {}): StandupEntry => ({
  section: 'did',
  issueId: 101,
  origin: 'assigned',
  notes: 'Fixed the login bug',
  newStatusId: null,
  ...overrides,
});

describe('SubmissionStore', () => {
  let now: Date;
  let store: SubmissionStore;

  const submitAt = (iso: string, slackUserId: string, entries: StandupEntry[] = [entry()]) => {
    now = new Date(iso);
    return store.record({ slackUserId, auditPayload: { raw: true }, reportText: 'report', entries });
  };

  beforeEach(() => {
    now = new Date('2026-09-29T03:00:00Z');
    store = new SubmissionStore(openDatabase(':memory:'), new Calendar('Asia/Ho_Chi_Minh', () => now));
  });

  it('round-trips a submission with its items, newest first', () => {
    submitAt('2026-09-28T02:00:00Z', 'U1', [entry({ issueId: 1 })]);
    const { items } = submitAt('2026-09-29T02:00:00Z', 'U2', [
      entry({ issueId: 2, section: 'doing', origin: 'added', newStatusId: 3 }),
    ]);

    const recent = store.recent(10, null);
    expect(recent.map((s) => s.slackUserId)).toEqual(['U2', 'U1']);
    expect(recent[0]?.submittedAt.toISOString()).toBe('2026-09-29T02:00:00.000Z');
    expect(recent[0]?.items).toEqual([
      { section: 'doing', issueId: 2, origin: 'added', notes: 'Fixed the login bug', newStatusId: 3, syncedToRedmine: false },
    ]);
    expect(items[0]?.entry.issueId).toBe(2);
    expect(store.recent(10, 'U1').map((s) => s.slackUserId)).toEqual(['U1']);
  });

  it('records the Redmine sync outcome per item', () => {
    const { items } = submitAt('2026-09-29T02:00:00Z', 'U1', [entry({ issueId: 1 }), entry({ issueId: 2 })]);
    store.recordSync(items[0]!.itemId, { ok: true });
    store.recordSync(items[1]!.itemId, { ok: false, error: 'HTTP 422' });
    expect(store.recent(1, null)[0]?.items.map((i) => i.syncedToRedmine)).toEqual([true, false]);
  });

  it("counts today by the team's calendar, not UTC", () => {
    // 18:00 UTC on the 28th is 01:00 on the 29th in Ho Chi Minh City: today.
    submitAt('2026-09-28T18:00:00Z', 'early-bird');
    // 16:00 UTC on the 28th is 23:00 on the 28th locally: yesterday. In UTC both are the 28th.
    submitAt('2026-09-28T16:00:00Z', 'night-owl');
    now = new Date('2026-09-29T03:00:00Z');
    expect(store.submittersToday()).toEqual(new Set(['early-bird']));
  });

  it('fills days with no submissions with zero', () => {
    submitAt('2026-09-27T03:00:00Z', 'U1');
    submitAt('2026-09-29T01:00:00Z', 'U1');
    submitAt('2026-09-29T02:00:00Z', 'U2');
    now = new Date('2026-09-29T03:00:00Z');
    expect(store.dailyCounts(4, null)).toEqual([
      { day: '2026-09-26', count: 0 },
      { day: '2026-09-27', count: 1 },
      { day: '2026-09-28', count: 0 },
      { day: '2026-09-29', count: 2 },
    ]);
    expect(store.dailyCounts(1, 'U2')).toEqual([{ day: '2026-09-29', count: 1 }]);
  });

  it('counts assigned and added items', () => {
    expect(store.originCounts(null)).toEqual({ assigned: 0, added: 0 });
    submitAt('2026-09-29T01:00:00Z', 'U1', [entry(), entry({ origin: 'added' }), entry({ origin: 'added' })]);
    submitAt('2026-09-29T02:00:00Z', 'U2', [entry()]);
    expect(store.originCounts(null)).toEqual({ assigned: 2, added: 2 });
    expect(store.originCounts('U1')).toEqual({ assigned: 1, added: 2 });
  });
});
