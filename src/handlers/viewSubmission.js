const { updateIssue } = require('../lib/redmineClient');
const { getUserBySlackId, createSubmission, addSubmissionItem, markItemSynced } = require('../lib/db');

/**
 * Parses `view.state.values` into a structured list of items per section.
 * Block IDs follow the pattern set in modalBuilder.js:
 *   <section>_issue_<id>_notes  -> plain_text_input
 *   <section>_issue_<id>_status -> static_select (optional)
 */
function parseSections(stateValues, metadata) {
  const sections = { did: [], doing: [] };

  for (const [blockId, actions] of Object.entries(stateValues)) {
    const match = blockId.match(/^(did|doing)_issue_(\d+)_(notes|status)$/);
    if (!match) continue;
    const [, section, issueIdStr, field] = match;
    const issueId = Number(issueIdStr);

    let entry = sections[section].find((e) => e.issueId === issueId);
    if (!entry) {
      const isManual = (metadata[section]?.manualIds || []).includes(issueId);
      entry = { issueId, isManual, notes: null, statusId: null };
      sections[section].push(entry);
    }

    if (field === 'notes') {
      entry.notes = Object.values(actions)[0]?.value || '';
    } else if (field === 'status') {
      const selected = Object.values(actions)[0]?.selected_option;
      entry.statusId = selected ? Number(selected.value) : null;
    }
  }

  return sections;
}

function formatReport({ slackUserId, sections }) {
  const line = (e) =>
    `  ${e.isManual ? '🆕' : '📋'} #${e.issueId}: ${e.notes || '_no notes_'}` +
    (e.statusId ? ` _(status → ${e.statusId})_` : '');

  const did = sections.did.map(line).join('\n') || '  _none_';
  const doing = sections.doing.map(line).join('\n') || '  _none_';

  return `*Daily Update from <@${slackUserId}>*\n\n*What I did:*\n${did}\n\n*What I am doing:*\n${doing}`;
}

function registerViewSubmission(app) {
  app.view('standup_submit', async ({ ack, body, view, client }) => {
    await ack();

    const slackUserId = body.user.id;
    const user = getUserBySlackId(slackUserId);
    if (!user) return; // shouldn't happen — modal wouldn't have opened without a user

    const metadata = JSON.parse(view.private_metadata || '{}');
    const sections = parseSections(view.state.values, metadata);
    const reportText = formatReport({ slackUserId, sections });

    const submissionId = createSubmission({
      slackUserId,
      rawPayload: view.state.values,
      reportText,
    });

    // Write each touched issue back to Redmine as a comment (+status if changed).
    const allItems = [
      ...sections.did.map((e) => ({ ...e, section: 'did' })),
      ...sections.doing.map((e) => ({ ...e, section: 'doing' })),
    ];

    await Promise.all(
      allItems.map(async (item) => {
        const itemId = addSubmissionItem({
          submissionId,
          section: item.section,
          issueId: item.issueId,
          issueSubject: null,
          isManual: item.isManual ? 1 : 0,
          notes: item.notes,
          oldStatusId: null,
          newStatusId: item.statusId,
        });

        try {
          const noteLabel = item.section === 'did' ? 'What I did' : 'What I am doing';
          await updateIssue(user.redmine_api_key, item.issueId, {
            notes: `[Daily Update - ${noteLabel}]\n${item.notes}`,
            statusId: item.statusId || undefined,
          });
          markItemSynced(itemId);
        } catch (err) {
          console.error(`Redmine update failed for issue #${item.issueId}:`, err.message);
          markItemSynced(itemId, err.message);
        }
      })
    );

    const channel = process.env.SLACK_UPDATES_CHANNEL;
    if (channel) {
      await client.chat.postMessage({ channel, text: reportText, mrkdwn: true });
    }
  });
}

module.exports = { registerViewSubmission };
