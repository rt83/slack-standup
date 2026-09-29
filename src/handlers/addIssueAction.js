const { getIssue, getMyOpenIssues, getIssueStatuses } = require('../lib/redmineClient');
const { getUserBySlackId } = require('../lib/db');
const { buildStandupModal } = require('../blocks/modalBuilder');

/**
 * Fires when a user picks an issue from the "+ Add issue" external_select
 * in either section. We re-derive the full current state (auto issues +
 * manual issues added so far, read from private_metadata) and re-render
 * the modal via views.update with the new issue appended.
 *
 * Note: this does NOT preserve notes/status the user already typed into
 * other issue blocks — views.update replaces the whole view. Slack Bolt
 * doesn't give partial-block updates, so if you need to preserve in-progress
 * typing across an add, read it back from `body.view.state.values` here
 * and re-inject as `initial_value` / `initial_option` when rebuilding.
 */
function registerAddIssueAction(app) {
  app.action(/^add_issue_select$/, async ({ ack, body, client, action }) => {
    await ack();

    const slackUserId = body.user.id;
    const user = getUserBySlackId(slackUserId);
    if (!user) return;

    const section = body.actions[0].block_id.startsWith('did') ? 'did' : 'doing';
    const newIssueId = Number(action.selected_option.value);

    const metadata = JSON.parse(body.view.private_metadata || '{}');
    const currentValues = body.view.state.values;

    const [autoIssues, statuses, newIssue] = await Promise.all([
      getMyOpenIssues(user.redmine_api_key),
      getIssueStatuses(user.redmine_api_key),
      getIssue(user.redmine_api_key, newIssueId),
    ]);

    // Merge: keep manual issues already added to both sections, add the new one
    // to whichever section triggered this action.
    const didManualIds = new Set(metadata.did?.manualIds || []);
    const doingManualIds = new Set(metadata.doing?.manualIds || []);
    (section === 'did' ? didManualIds : doingManualIds).add(newIssueId);

    const resolveManual = async (ids) =>
      Promise.all(
        [...ids].map((id) => (id === newIssueId ? newIssue : getIssue(user.redmine_api_key, id)))
      );

    const [didManual, doingManual] = await Promise.all([
      resolveManual(didManualIds),
      resolveManual(doingManualIds),
    ]);

    const view = buildStandupModal({
      didAuto: autoIssues,
      didManual,
      doingAuto: autoIssues,
      doingManual,
      statuses,
    });

    // Re-inject any notes text the user had already typed, keyed by block_id,
    // so switching tabs to add an issue doesn't wipe their work.
    for (const block of view.blocks) {
      const existing = currentValues[block.block_id];
      if (!existing) continue;
      if (block.type === 'input' && block.element?.type === 'plain_text_input') {
        const actionId = Object.keys(existing)[0];
        const val = existing[actionId]?.value;
        if (val) block.element.initial_value = val;
      }
    }

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view,
    });
  });
}

module.exports = { registerAddIssueAction };
