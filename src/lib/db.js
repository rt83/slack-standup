const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/app.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
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
  submitted_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  raw_payload       TEXT NOT NULL,     -- full view_submission state, for audit/debug
  report_text       TEXT NOT NULL      -- formatted report posted to channel
);

CREATE TABLE IF NOT EXISTS submission_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id     INTEGER NOT NULL REFERENCES submissions(id),
  section           TEXT NOT NULL CHECK (section IN ('did', 'doing')),
  issue_id          INTEGER NOT NULL,
  issue_subject     TEXT,
  is_manual         INTEGER NOT NULL DEFAULT 0,  -- 1 = added manually, not from in-progress list
  notes             TEXT,
  old_status_id     INTEGER,
  new_status_id     INTEGER,
  redmine_synced    INTEGER NOT NULL DEFAULT 0,  -- 1 once the Redmine write succeeded
  redmine_error     TEXT
);
`);

// --- user mapping -----------------------------------------------------

function upsertUser({ slackUserId, redmineUserId, redmineApiKey, displayName }) {
  db.prepare(`
    INSERT INTO users (slack_user_id, redmine_user_id, redmine_api_key, display_name)
    VALUES (@slackUserId, @redmineUserId, @redmineApiKey, @displayName)
    ON CONFLICT(slack_user_id) DO UPDATE SET
      redmine_user_id = excluded.redmine_user_id,
      redmine_api_key = excluded.redmine_api_key,
      display_name = excluded.display_name
  `).run({ slackUserId, redmineUserId, redmineApiKey, displayName });
}

function getUserBySlackId(slackUserId) {
  return db.prepare(`SELECT * FROM users WHERE slack_user_id = ?`).get(slackUserId);
}

function listUsers() {
  return db.prepare(`SELECT * FROM users`).all();
}

// --- submissions --------------------------------------------------------

function createSubmission({ slackUserId, rawPayload, reportText }) {
  const info = db.prepare(`
    INSERT INTO submissions (slack_user_id, raw_payload, report_text)
    VALUES (?, ?, ?)
  `).run(slackUserId, JSON.stringify(rawPayload), reportText);
  return info.lastInsertRowid;
}

function addSubmissionItem(item) {
  db.prepare(`
    INSERT INTO submission_items
      (submission_id, section, issue_id, issue_subject, is_manual, notes, old_status_id, new_status_id)
    VALUES
      (@submissionId, @section, @issueId, @issueSubject, @isManual, @notes, @oldStatusId, @newStatusId)
  `).run(item);
  return db.prepare(`SELECT last_insert_rowid() AS id`).get().id;
}

function markItemSynced(itemId, error = null) {
  db.prepare(`
    UPDATE submission_items SET redmine_synced = ?, redmine_error = ? WHERE id = ?
  `).run(error ? 0 : 1, error, itemId);
}

function hasSubmittedToday(slackUserId, tz) {
  // Simple UTC-day check; swap for a TZ-aware check if your team spans zones.
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM submissions
    WHERE slack_user_id = ? AND date(submitted_at) = date('now')
  `).get(slackUserId);
  return row.n > 0;
}

// --- dashboard queries ---------------------------------------------------

/**
 * Recent submissions with their items attached, optionally filtered to one
 * person. Two queries (submissions, then items for those IDs) rather than a
 * join, so each submission's items come back as a clean nested array.
 */
function getSubmissionsWithItems({ slackUserId = null, limit = 30 } = {}) {
  const submissions = slackUserId
    ? db.prepare(`
        SELECT * FROM submissions WHERE slack_user_id = ?
        ORDER BY submitted_at DESC LIMIT ?
      `).all(slackUserId, limit)
    : db.prepare(`
        SELECT * FROM submissions ORDER BY submitted_at DESC LIMIT ?
      `).all(limit);

  if (submissions.length === 0) return [];

  const ids = submissions.map((s) => s.id);
  const placeholders = ids.map(() => '?').join(',');
  const items = db.prepare(`
    SELECT * FROM submission_items WHERE submission_id IN (${placeholders})
  `).all(...ids);

  const itemsBySubmission = new Map();
  for (const item of items) {
    if (!itemsBySubmission.has(item.submission_id)) itemsBySubmission.set(item.submission_id, []);
    itemsBySubmission.get(item.submission_id).push(item);
  }

  return submissions.map((s) => ({ ...s, items: itemsBySubmission.get(s.id) || [] }));
}

/** Submission counts per day for the last N days, for the trend chart. */
function getDailySubmissionCounts({ slackUserId = null, days = 14 } = {}) {
  const rows = slackUserId
    ? db.prepare(`
        SELECT date(submitted_at) AS day, COUNT(*) AS n
        FROM submissions
        WHERE slack_user_id = ? AND submitted_at >= date('now', ?)
        GROUP BY day ORDER BY day
      `).all(slackUserId, `-${days} days`)
    : db.prepare(`
        SELECT date(submitted_at) AS day, COUNT(*) AS n
        FROM submissions
        WHERE submitted_at >= date('now', ?)
        GROUP BY day ORDER BY day
      `).all(`-${days} days`);

  // Fill in zero-count days so the chart doesn't skip gaps.
  const byDay = new Map(rows.map((r) => [r.day, r.n]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ day: key, count: byDay.get(key) || 0 });
  }
  return result;
}

/** Manual vs. auto-pulled issue counts, for the composition chart. */
function getManualVsAutoCounts({ slackUserId = null } = {}) {
  const row = slackUserId
    ? db.prepare(`
        SELECT
          SUM(CASE WHEN si.is_manual = 1 THEN 1 ELSE 0 END) AS manual,
          SUM(CASE WHEN si.is_manual = 0 THEN 1 ELSE 0 END) AS auto
        FROM submission_items si
        JOIN submissions s ON s.id = si.submission_id
        WHERE s.slack_user_id = ?
      `).get(slackUserId)
    : db.prepare(`
        SELECT
          SUM(CASE WHEN is_manual = 1 THEN 1 ELSE 0 END) AS manual,
          SUM(CASE WHEN is_manual = 0 THEN 1 ELSE 0 END) AS auto
        FROM submission_items
      `).get();
  return { manual: row.manual || 0, auto: row.auto || 0 };
}

/** Who has/hasn't submitted today, for the "missing reports" panel. */
function getTodaySubmissionStatus() {
  const users = listUsers();
  const submittedIds = new Set(
    db.prepare(`
      SELECT DISTINCT slack_user_id FROM submissions WHERE date(submitted_at) = date('now')
    `).all().map((r) => r.slack_user_id)
  );
  return users.map((u) => ({
    slackUserId: u.slack_user_id,
    displayName: u.display_name,
    submittedToday: submittedIds.has(u.slack_user_id),
  }));
}

module.exports = {
  db,
  upsertUser,
  getUserBySlackId,
  listUsers,
  createSubmission,
  addSubmissionItem,
  markItemSynced,
  hasSubmittedToday,
  getSubmissionsWithItems,
  getDailySubmissionCounts,
  getManualVsAutoCounts,
  getTodaySubmissionStatus,
};
