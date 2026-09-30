import type Database from 'better-sqlite3';

/** A Slack user linked to a Redmine account. */
export interface LinkedUser {
  readonly slackUserId: string;
  readonly redmineUserId: number;
  /** The person's own key, so Redmine attributes comments and status changes to them. */
  readonly redmineApiKey: string;
  readonly displayName: string;
}

interface UserRow {
  slack_user_id: string;
  redmine_user_id: number;
  redmine_api_key: string;
  display_name: string | null;
}

/** Persists the Slack-to-Redmine account links. */
export class UserStore {
  readonly #db: Database.Database;

  constructor(db: Database.Database) {
    this.#db = db;
  }

  link(user: LinkedUser): void {
    this.#db
      .prepare(
        `INSERT INTO users (slack_user_id, redmine_user_id, redmine_api_key, display_name)
         VALUES (@slackUserId, @redmineUserId, @redmineApiKey, @displayName)
         ON CONFLICT(slack_user_id) DO UPDATE SET
           redmine_user_id = excluded.redmine_user_id,
           redmine_api_key = excluded.redmine_api_key,
           display_name    = excluded.display_name`
      )
      .run(user);
  }

  find(slackUserId: string): LinkedUser | undefined {
    const row = this.#db
      .prepare<[string], UserRow>(`SELECT * FROM users WHERE slack_user_id = ?`)
      .get(slackUserId);
    return row && toLinkedUser(row);
  }

  list(): LinkedUser[] {
    return this.#db.prepare<[], UserRow>(`SELECT * FROM users`).all().map(toLinkedUser);
  }
}

function toLinkedUser(row: UserRow): LinkedUser {
  return {
    slackUserId: row.slack_user_id,
    redmineUserId: row.redmine_user_id,
    redmineApiKey: row.redmine_api_key,
    displayName: row.display_name || row.slack_user_id,
  };
}
