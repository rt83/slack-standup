const axios = require('axios');

const BASE_URL = process.env.REDMINE_BASE_URL;

function clientFor(apiKey) {
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'X-Redmine-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: 10000,
  });
}

/**
 * Issues currently assigned to the user and "in progress"-like.
 * Adjust status filter to match your Redmine's tracker workflow —
 * `status_id=open` returns all non-closed statuses; if you only want
 * ones actually marked "In Progress" you'll need that status's numeric ID.
 *
 * The list endpoint doesn't return per-issue workflow transitions, so we
 * hydrate each issue with a single-issue GET (which does, via
 * `allowed_statuses` — see getIssue). Fine for the handful of in-progress
 * issues a person typically has; if that list gets large, consider caching
 * per issue for the duration of a modal session instead of re-fetching.
 */
async function getMyOpenIssues(apiKey, { statusId = 'open', limit = 50 } = {}) {
  const client = clientFor(apiKey);
  const { data } = await client.get('/issues.json', {
    params: {
      assigned_to_id: 'me',
      status_id: statusId,
      limit,
      sort: 'updated_on:desc',
    },
  });
  return Promise.all(data.issues.map((issue) => getIssue(apiKey, issue.id)));
}

/**
 * Search issues by number or subject text, for the "+ Add issue" autocomplete.
 * If the query looks like a bare number, fetch that issue directly too, since
 * Redmine's subject search won't match on ID.
 */
async function searchIssues(apiKey, query, { limit = 15 } = {}) {
  const client = clientFor(apiKey);
  const results = [];

  if (/^\d+$/.test(query.trim())) {
    try {
      const { data } = await client.get(`/issues/${query.trim()}.json`);
      results.push(normalizeIssue(data.issue));
    } catch (err) {
      // Not found or inaccessible — fall through to subject search.
    }
  }

  const { data } = await client.get('/issues.json', {
    params: { subject: `~${query}`, limit, status_id: '*' },
  });
  for (const issue of data.issues) {
    if (!results.find((r) => r.id === issue.id)) results.push(normalizeIssue(issue));
  }

  return results.slice(0, limit);
}

/**
 * Fetches a single issue. Redmine includes `allowed_statuses` in this
 * response when the authenticated user has permission to edit the issue —
 * this is the actual per-tracker, per-role workflow transition list (not
 * every status in the system). We rely on that instead of hand-rolling
 * workflow rules. If it's absent (older Redmine, or no edit permission),
 * callers fall back to the global status list.
 */
async function getIssue(apiKey, issueId) {
  const client = clientFor(apiKey);
  const { data } = await client.get(`/issues/${issueId}.json`, {
    params: { include: 'attachments' },
  });
  return normalizeIssue(data.issue);
}

/**
 * All statuses defined in Redmine — used only as a fallback when an issue's
 * `allowed_statuses` isn't available (see getIssue). This is NOT
 * workflow-filtered, so prefer issue.allowedStatuses wherever you have it.
 */
let _statusCache = null;
async function getIssueStatuses(apiKey) {
  if (_statusCache) return _statusCache;
  const client = clientFor(apiKey);
  const { data } = await client.get('/issue_statuses.json');
  _statusCache = data.issue_statuses;
  return _statusCache;
}

/**
 * Write a journal comment and, optionally, a status change to an issue.
 * Uses the submitting user's own API key so the comment is attributed to them
 * in Redmine, not to a shared bot account.
 */
async function updateIssue(apiKey, issueId, { notes, statusId } = {}) {
  const client = clientFor(apiKey);
  const payload = { issue: {} };
  if (notes) payload.issue.notes = notes;
  if (statusId) payload.issue.status_id = statusId;
  await client.put(`/issues/${issueId}.json`, payload);
}

function normalizeIssue(issue) {
  return {
    id: issue.id,
    subject: issue.subject,
    statusId: issue.status?.id,
    statusName: issue.status?.name,
    projectName: issue.project?.name,
    trackerName: issue.tracker?.name,
    // Workflow-legal transitions for the current user/tracker/role, when
    // Redmine provides them; null means "unknown, fall back to global list".
    allowedStatuses: issue.allowed_statuses
      ? issue.allowed_statuses.map((s) => ({ id: s.id, name: s.name }))
      : null,
  };
}

module.exports = {
  getMyOpenIssues,
  searchIssues,
  getIssue,
  getIssueStatuses,
  updateIssue,
};
