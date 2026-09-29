/** A calendar date in the team's time zone, formatted `YYYY-MM-DD`. */
export type CalendarDay = string;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The single answer to "which day is it?" for the whole app. Every "today" check (the
 * reminder, the dashboard, the per-day chart) goes through one instance, so they cannot
 * disagree about where a day starts.
 */
export class Calendar {
  readonly timeZone: string;
  readonly #now: () => Date;
  readonly #dayFormat: Intl.DateTimeFormat;

  constructor(timeZone: string, now: () => Date = () => new Date()) {
    this.timeZone = timeZone;
    this.#now = now;
    this.#dayFormat = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  now(): Date {
    return this.#now();
  }

  today(): CalendarDay {
    return this.dayOf(this.#now());
  }

  dayOf(instant: Date): CalendarDay {
    const parts = this.#dayFormat.formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  /** The last `count` days ending today, oldest first. */
  lastDays(count: number): CalendarDay[] {
    // Step on the calendar date itself rather than subtracting 24h from "now", which
    // lands on the wrong day across a DST change.
    const today = Date.parse(`${this.today()}T00:00:00Z`);
    return Array.from({ length: count }, (_, i) =>
      new Date(today - (count - 1 - i) * MS_PER_DAY).toISOString().slice(0, 10)
    );
  }

  /** An instant no later than the start of the day `daysBack` days before today. */
  lowerBoundFor(daysBack: number): Date {
    // A local day can start up to 14h before or 12h after UTC midnight, so two spare days
    // always cover it. Callers filter by `dayOf` for the exact edge.
    return new Date(this.#now().getTime() - (daysBack + 2) * MS_PER_DAY);
  }
}
