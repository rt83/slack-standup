import type Database from 'better-sqlite3';
import type { Calendar, CalendarDay } from './calendar.ts';
import type { IssueOrigin, Section, StandupEntry } from '../standup/types.ts';

export interface NewSubmission {
  readonly slackUserId: string;
  /** The raw form state, kept for audit and debugging. */
  readonly auditPayload: unknown;
  readonly reportText: string;
  readonly entries: readonly StandupEntry[];
}

export interface RecordedItem {
  readonly itemId: number;
  readonly entry: StandupEntry;
}

export interface RecordedSubmission {
  readonly submissionId: number;
  readonly items: readonly RecordedItem[];
}

export type SyncOutcome = { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface StoredItem {
  readonly section: Section;
  readonly issueId: number;
  readonly origin: IssueOrigin;
  readonly notes: string;
  readonly newStatusId: number | null;
  readonly syncedToRedmine: boolean;
}

export interface StoredSubmission {
  readonly id: number;
  readonly slackUserId: string;
  readonly submittedAt: Date;
  readonly items: readonly StoredItem[];
}

export interface DayCount {
  readonly day: CalendarDay;
  readonly count: number;
}

interface SubmissionRow {
  id: number;
  slack_user_id: string;
  submitted_at: string;
}

interface ItemRow {
  submission_id: number;
  section: Section;
  issue_id: number;
  is_manual: number;
  notes: string | null;
  new_status_id: number | null;
  redmine_synced: number;
}

/**
 * Persists submissions and answers the questions asked of them. Days are the team's
 * calendar days, via the `local_day()` SQL function this store registers from its
 * Calendar — SQLite's own `date('now')` is UTC and is not used.
 */
export class SubmissionStore {
  readonly #db: Database.Database;
  readonly #calendar: Calendar;

  constructor(db: Database.Database, calendar: Calendar) {
    this.#db = db;
    this.#calendar = calendar;
    db.function('local_day', { deterministic: true }, (stored: unknown) =>
      typeof stored === 'string' ? calendar.dayOf(fromStoredTimestamp(stored)) : null
    );
  }

  record(submission: NewSubmission): RecordedSubmission {
    const insertSubmission = this.#db.prepare(
      `INSERT INTO submissions (slack_user_id, submitted_at, raw_payload, report_text)
       VALUES (?, ?, ?, ?)`
    );
    const insertItem = this.#db.prepare(
      `INSERT INTO submission_items
         (submission_id, section, issue_id, is_manual, notes, new_status_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    return this.#db.transaction((): RecordedSubmission => {
      const submissionId = Number(
        insertSubmission.run(
          submission.slackUserId,
          toStoredTimestamp(this.#calendar.now()),
          JSON.stringify(submission.auditPayload),
          submission.reportText
        ).lastInsertRowid
      );
      const items = submission.entries.map((entry) => ({
        entry,
        itemId: Number(
          insertItem.run(
            submissionId,
            entry.section,
            entry.issueId,
            entry.origin === 'added' ? 1 : 0,
            entry.notes,
            entry.newStatusId
          ).lastInsertRowid
        ),
      }));
      return { submissionId, items };
    })();
  }

  recordSync(itemId: number, outcome: SyncOutcome): void {
    this.#db
      .prepare(`UPDATE submission_items SET redmine_synced = ?, redmine_error = ? WHERE id = ?`)
      .run(outcome.ok ? 1 : 0, outcome.ok ? null : outcome.error, itemId);
  }

  /** Slack user ids with at least one submission on today's date. */
  submittersToday(): Set<string> {
    const rows = this.#db
      .prepare<[string, string], { slack_user_id: string }>(
        `SELECT DISTINCT slack_user_id FROM submissions
         WHERE submitted_at >= ? AND local_day(submitted_at) = ?`
      )
      .all(toStoredTimestamp(this.#calendar.lowerBoundFor(0)), this.#calendar.today());
    return new Set(rows.map((r) => r.slack_user_id));
  }

  /** Submissions per day over the last `days` days, oldest first, with empty days as 0. */
  dailyCounts(days: number, slackUserId: string | null): DayCount[] {
    const rows = this.#db
      .prepare<[string, string | null, string | null], { day: string; n: number }>(
        `SELECT local_day(submitted_at) AS day, COUNT(*) AS n FROM submissions
         WHERE submitted_at >= ? AND (? IS NULL OR slack_user_id = ?)
         GROUP BY day`
      )
      .all(toStoredTimestamp(this.#calendar.lowerBoundFor(days - 1)), slackUserId, slackUserId);
    const byDay = new Map(rows.map((r) => [r.day, r.n]));
    return this.#calendar.lastDays(days).map((day) => ({ day, count: byDay.get(day) ?? 0 }));
  }

  /** How many recorded items were assigned vs. added by hand, across all time. */
  originCounts(slackUserId: string | null): Record<IssueOrigin, number> {
    const row = this.#db
      .prepare<[string | null, string | null], { added: number | null; assigned: number | null }>(
        `SELECT SUM(si.is_manual = 1) AS added, SUM(si.is_manual = 0) AS assigned
         FROM submission_items si JOIN submissions s ON s.id = si.submission_id
         WHERE (? IS NULL OR s.slack_user_id = ?)`
      )
      .get(slackUserId, slackUserId);
    return { assigned: row?.assigned ?? 0, added: row?.added ?? 0 };
  }

  /** The most recent submissions, newest first, each with its items. */
  recent(limit: number, slackUserId: string | null): StoredSubmission[] {
    const submissions = this.#db
      .prepare<[string | null, string | null, number], SubmissionRow>(
        `SELECT id, slack_user_id, submitted_at FROM submissions
         WHERE (? IS NULL OR slack_user_id = ?)
         ORDER BY submitted_at DESC, id DESC LIMIT ?`
      )
      .all(slackUserId, slackUserId, limit);
    if (submissions.length === 0) return [];

    const ids = submissions.map((s) => s.id);
    const items = this.#db
      .prepare<number[], ItemRow>(
        `SELECT * FROM submission_items
         WHERE submission_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`
      )
      .all(...ids);

    const itemsBySubmission = Map.groupBy(items, (item) => item.submission_id);
    return submissions.map((s) => ({
      id: s.id,
      slackUserId: s.slack_user_id,
      submittedAt: fromStoredTimestamp(s.submitted_at),
      items: (itemsBySubmission.get(s.id) ?? []).map(toStoredItem),
    }));
  }
}

function toStoredItem(row: ItemRow): StoredItem {
  return {
    section: row.section,
    issueId: row.issue_id,
    origin: row.is_manual ? 'added' : 'assigned',
    notes: row.notes ?? '',
    newStatusId: row.new_status_id,
    syncedToRedmine: row.redmine_synced === 1,
  };
}

/** Timestamps are stored as UTC in SQLite's `CURRENT_TIMESTAMP` shape, which sorts as text. */
function toStoredTimestamp(instant: Date): string {
  return instant.toISOString().slice(0, 19).replace('T', ' ');
}

function fromStoredTimestamp(stored: string): Date {
  return new Date(`${stored.replace(' ', 'T')}Z`);
}
