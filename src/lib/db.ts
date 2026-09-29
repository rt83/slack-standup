import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  slack_user_id     TEXT PRIMARY KEY,
  redmine_user_id   INTEGER,
  redmine_api_key   TEXT NOT NULL,
  display_name      TEXT,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slack_user_id     TEXT NOT NULL,
  submitted_at      TEXT DEFAULT CURRENT_TIMESTAMP, -- UTC, 'YYYY-MM-DD HH:MM:SS'
  raw_payload       TEXT NOT NULL,     -- full view_submission state, for audit/debug
  report_text       TEXT NOT NULL      -- formatted report posted to channel
);

CREATE TABLE IF NOT EXISTS submission_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id     INTEGER NOT NULL REFERENCES submissions(id),
  section           TEXT NOT NULL CHECK (section IN ('did', 'doing')),
  issue_id          INTEGER NOT NULL,
  issue_subject     TEXT,              -- never written; kept so existing databases still match
  is_manual         INTEGER NOT NULL DEFAULT 0,  -- 1 = added by hand, 0 = assigned
  notes             TEXT,
  old_status_id     INTEGER,           -- never written; kept so existing databases still match
  new_status_id     INTEGER,
  redmine_synced    INTEGER NOT NULL DEFAULT 0,  -- 1 once the Redmine write succeeded
  redmine_error     TEXT
);
`;

/** Opens (creating if needed) the app's SQLite database with its schema applied. */
export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}
