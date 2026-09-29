const { getMyOpenIssues, getIssueStatuses } = require('../lib/redmineClient');
const { getUserBySlackId } = require('../lib/db');
const { buildStandupModal } = require('../blocks/modalBuilder');

/**
 * Shared by the /update slash command and the Home tab button.
 * Looks up the user's Redmine credentials, pulls their in-progress issues,
 * and opens the modal pre-filled.
 */
async function openStandupModal({ client, triggerId, slackUserId }) {
  const user = getUserBySlackId(slackUserId);

  if (!user) {
    // No Redmine mapping yet — open a lightweight modal telling them to
    // get set up, rather than failing silently or crashing on a null key.
    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        title: { type: 'plain_text', text: 'Daily Update' },
        close: { type: 'plain_text', text: 'Close' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':warning: Your Slack account isn\'t linked to Redmine yet. Ask an admin to run `/link-redmine` for you, or DM the bot your Redmine API key.',
            },
          },
        ],
      },
    });
    return;
  }

  const [autoIssues, statuses] = await Promise.all([
    getMyOpenIssues(user.redmine_api_key),
    getIssueStatuses(user.redmine_api_key),
  ]);

  // On first open there are no manual issues yet in either section.
  const view = buildStandupModal({
    didAuto: autoIssues,
    didManual: [],
    doingAuto: autoIssues, // same in-progress list seeds both sections;
                           // devs edit notes differently for each context.
    doingManual: [],
    statuses,
  });

  await client.views.open({ trigger_id: triggerId, view });
}

module.exports = { openStandupModal };
