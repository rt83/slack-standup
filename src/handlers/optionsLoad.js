const { searchIssues } = require('../lib/redmineClient');
const { getUserBySlackId } = require('../lib/db');

/**
 * Registered against action_id "add_issue_select" (options endpoint).
 * Slack calls this as the user types in the "+ Add issue" external_select.
 */
function registerOptionsLoad(app) {
  app.options('add_issue_select', async ({ options, ack, body }) => {
    const query = options.value?.trim();
    const slackUserId = body.user.id;
    const user = getUserBySlackId(slackUserId);

    if (!user || !query) {
      await ack({ options: [] });
      return;
    }

    try {
      const issues = await searchIssues(user.redmine_api_key, query);
      await ack({
        options: issues.map((issue) => ({
          text: {
            type: 'plain_text',
            text: `#${issue.id} ${issue.subject}`.slice(0, 75), // Slack's option text limit
          },
          value: String(issue.id),
        })),
      });
    } catch (err) {
      console.error('searchIssues failed', err.message);
      await ack({ options: [] });
    }
  });
}

module.exports = { registerOptionsLoad };
