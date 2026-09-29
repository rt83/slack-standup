/**
 * Builds the standup report modal.
 *
 * Block Kit has no arbitrary text color, so "manually added" items are
 * distinguished by:
 *   - a 🆕 emoji prefix on the label (auto items get 📋)
 *   - being separated under a "Manually added" context divider
 * Each issue gets: a section header (issue #, subject, project),
 * a notes textarea, and a status static_select.
 *
 * block_ids / action_ids are structured so view_submission can parse them:
 *   did_issue_<id>_notes / did_issue_<id>_status
 *   doing_issue_<id>_notes / doing_issue_<id>_status
 * Manual vs auto is tracked separately in `private_metadata` (JSON) since
 * Block Kit itself doesn't carry that flag back on submit.
 */

function issueBlocks(section, issue, { isManual, fallbackStatuses }) {
  const emoji = isManual ? '🆕' : '📋';
  const header = {
    type: 'section',
    block_id: `${section}_issue_${issue.id}_header`,
    text: {
      type: 'mrkdwn',
      text: `${emoji} *#${issue.id} ${issue.subject}*${
        issue.projectName ? `  _(${issue.projectName})_` : ''
      }`,
    },
  };

  const notesInput = {
    type: 'input',
    block_id: `${section}_issue_${issue.id}_notes`,
    optional: false,
    label: {
      type: 'plain_text',
      text: section === 'did' ? 'Details / blocker / remaining work' : 'Problem / tackling / plan',
    },
    element: {
      type: 'plain_text_input',
      multiline: true,
      action_id: 'notes_input',
      initial_value: '',
    },
  };

  // Prefer the issue's own workflow-legal transitions (Redmine's
  // `allowed_statuses`, scoped to this tracker + the user's role) over the
  // global status list. Always include the issue's current status as an
  // option even if it's not a "transition" per se, so the dropdown can be
  // left showing where the issue already is.
  const availableStatuses = issue.allowedStatuses?.length
    ? issue.allowedStatuses
    : fallbackStatuses || [];

  const statusSelect = {
    type: 'input',
    block_id: `${section}_issue_${issue.id}_status`,
    optional: true,
    label: { type: 'plain_text', text: 'Change status (optional)' },
    element: {
      type: 'static_select',
      action_id: 'status_select',
      placeholder: { type: 'plain_text', text: issue.statusName || 'Select status' },
      options: statusOptions(availableStatuses),
    },
  };

  return [header, notesInput, statusSelect, { type: 'divider' }];
}

function statusOptions(statuses) {
  return statuses.map((s) => ({
    text: { type: 'plain_text', text: s.name },
    value: String(s.id),
  }));
}

function addIssueButton(section) {
  return {
    type: 'actions',
    block_id: `${section}_add_issue`,
    elements: [
      {
        type: 'external_select',
        action_id: 'add_issue_select',
        placeholder: { type: 'plain_text', text: '+ Add issue by number or title' },
        min_query_length: 1,
      },
    ],
  };
}

function sectionBlocks(section, title, autoIssues, manualIssues, statuses) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title } },
  ];

  for (const issue of autoIssues) {
    blocks.push(...issueBlocks(section, issue, { isManual: false, fallbackStatuses: statuses }));
  }

  if (manualIssues.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '*Manually added*' }],
    });
    for (const issue of manualIssues) {
      blocks.push(...issueBlocks(section, issue, { isManual: true, fallbackStatuses: statuses }));
    }
  }

  blocks.push(addIssueButton(section));
  return blocks;
}

/**
 * @param {object} opts
 * @param {Array}  opts.didAuto     - in-progress issues for "What I did"
 * @param {Array}  opts.didManual   - manually added issues for "What I did"
 * @param {Array}  opts.doingAuto   - in-progress issues for "What I am doing"
 * @param {Array}  opts.doingManual - manually added issues for "What I am doing"
 * @param {Array}  opts.statuses    - Redmine issue_statuses list
 */
function buildStandupModal({ didAuto, didManual, doingAuto, doingManual, statuses }) {
  return {
    type: 'modal',
    callback_id: 'standup_submit',
    title: { type: 'plain_text', text: 'Daily Update' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    // Track which issue IDs are "manual" per section, since Block Kit state
    // won't tell us on submit — view_submission reads this back.
    private_metadata: JSON.stringify({
      did: { manualIds: didManual.map((i) => i.id) },
      doing: { manualIds: doingManual.map((i) => i.id) },
    }),
    blocks: [
      ...sectionBlocks('did', 'What I did', didAuto, didManual, statuses),
      ...sectionBlocks('doing', 'What I am doing', doingAuto, doingManual, statuses),
    ],
  };
}

module.exports = { buildStandupModal, issueBlocks, statusOptions };
