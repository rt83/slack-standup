import { describe, expect, it } from 'vitest';
import { Calendar } from './calendar.ts';

const at = (iso: string) => () => new Date(iso);

describe('Calendar', () => {
  it('names the day in its own time zone, not UTC', () => {
    // 23:30 UTC on the 28th is already the 29th in Ho Chi Minh City (UTC+7).
    const instant = new Date('2026-09-28T23:30:00Z');
    expect(new Calendar('UTC').dayOf(instant)).toBe('2026-09-28');
    expect(new Calendar('Asia/Ho_Chi_Minh').dayOf(instant)).toBe('2026-09-29');
    expect(new Calendar('America/New_York').dayOf(new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-28');
  });

  it('takes today from its clock', () => {
    expect(new Calendar('Asia/Ho_Chi_Minh', at('2026-09-28T18:00:00Z')).today()).toBe('2026-09-29');
  });

  it('lists the last N days oldest first, one per calendar day across a DST change', () => {
    // US clocks fell back on 2026-11-01; stepping 24h from 00:30 would repeat a day.
    const calendar = new Calendar('America/New_York', at('2026-11-02T05:30:00Z')); // 00:30 local
    expect(calendar.lastDays(3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('gives a lower bound at or before the start of the requested day', () => {
    const calendar = new Calendar('Pacific/Kiritimati', at('2026-09-29T10:00:00Z')); // UTC+14
    const startOfToday = new Date('2026-09-28T10:00:00Z'); // local midnight on the 29th
    expect(calendar.lowerBoundFor(0).getTime()).toBeLessThanOrEqual(startOfToday.getTime());
  });
});
