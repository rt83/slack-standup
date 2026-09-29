require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const cron = require('node-cron');

const { openStandupModal } = require('./handlers/openModal');
const { registerOptionsLoad } = require('./handlers/optionsLoad');
const { registerAddIssueAction } = require('./handlers/addIssueAction');
const { registerViewSubmission } = require('./handlers/viewSubmission');
const { registerDashboardRoutes } = require('./web/server');
const { upsertUser, listUsers, hasSubmittedToday, getUserBySlackId } = require('./lib/db');

// ExpressReceiver instead of Bolt's default receiver so the dashboard's
// GET /dashboard route can live on the exact same server/port as the
// Slack request handlers, rather than running a second process.
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});
registerDashboardRoutes(receiver.router);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  // Switch to socketMode: true + appToken if you don't want to expose a
  // public HTTP endpoint (useful for local dev) — note that mode doesn't
  // give you a place to host /dashboard, so you'd still want a small
  // separate Express app for that in socket mode.
});

const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;

// --- entry points into the modal ---------------------------------------

app.command('/update', async ({ ack, body, client }) => {
  await ack();
  await openStandupModal({ client, triggerId: body.trigger_id, slackUserId: body.user_id });
});

app.event('app_home_opened', async ({ event, client }) => {
  await client.views.publish({
    user_id: event.user,
    view: {
      type: 'home',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '*Daily Update*' } },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Submit Daily Update' },
              action_id: 'open_standup_modal',
              style: 'primary',
            },
          ],
        },
      ],
    },
  });
});

app.action('open_standup_modal', async ({ ack, body, client }) => {
  await ack();
  await openStandupModal({ client, triggerId: body.trigger_id, slackUserId: body.user.id });
});

// --- modal interaction handlers -----------------------------------------

registerOptionsLoad(app);
registerAddIssueAction(app);
registerViewSubmission(app);

// --- /dashboard: link out to the web dashboard --------------------------
// Usage:
//   /dashboard                  -> team-wide dashboard
//   /dashboard --p @jane        -> Jane's personal dashboard
// Slack renders a mention in command text as <@U0123ABC> or
// <@U0123ABC|jane>, so we pull the ID out of that rather than parsing @jane
// as plain text (Slack doesn't resolve plain "@jane" for you).

app.command('/dashboard', async ({ ack, body, respond }) => {
  await ack();

  const text = (body.text || '').trim();
  const personMatch = text.match(/--p\s+<@([A-Z0-9]+)(?:\|[^>]+)?>/i);

  let url = `${PUBLIC_URL}/dashboard`;
  let label = 'Open team dashboard';

  if (personMatch) {
    const slackUserId = personMatch[1];
    const user = getUserBySlackId(slackUserId);
    if (!user) {
      await respond(`<@${slackUserId}> isn't linked to Redmine yet — nothing to show.`);
      return;
    }
    url = `${PUBLIC_URL}/dashboard?user=${slackUserId}`;
    label = `Open ${user.display_name || 'their'} dashboard`;
  } else if (text && !personMatch) {
    await respond('Usage: `/dashboard` or `/dashboard --p @person`');
    return;
  }

  await respond({
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: personMatch ? `Dashboard for <@${personMatch[1]}>:` : 'Team dashboard:' },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: label },
          url,
          action_id: 'noop_dashboard_link', // action_id is required even for url buttons, unused
        },
      },
    ],
    text: label, // fallback for notifications
  });
});

// --- admin: link a Slack user to a Redmine account -----------------------
// Simple slash command for now: /link-redmine @user <redmine_user_id> <api_key>
// Lock this down (e.g. check body.user_id against an admin allowlist) before
// using in production — anyone who can run it can attribute Redmine actions
// to another person's account.

app.command('/link-redmine', async ({ ack, body, client, respond }) => {
  await ack();
  const parts = body.text.trim().split(/\s+/);
  const mentionMatch = parts[0]?.match(/^<@([A-Z0-9]+)\|?.*>$/);

  if (!mentionMatch || parts.length < 3) {
    await respond('Usage: `/link-redmine @user <redmine_user_id> <redmine_api_key>`');
    return;
  }

  const [, slackUserId] = mentionMatch;
  const [, redmineUserId, redmineApiKey] = parts;
  const userInfo = await client.users.info({ user: slackUserId });

  upsertUser({
    slackUserId,
    redmineUserId: Number(redmineUserId),
    redmineApiKey,
    displayName: userInfo.user?.real_name || slackUserId,
  });

  await respond(`Linked <@${slackUserId}> to Redmine user #${redmineUserId}.`);
});

// --- daily reminder for non-submitters -----------------------------------

if (process.env.SUBMISSION_REMINDER_CRON) {
  cron.schedule(
    process.env.SUBMISSION_REMINDER_CRON,
    async () => {
      const users = listUsers();
      for (const user of users) {
        if (!hasSubmittedToday(user.slack_user_id)) {
          try {
            await app.client.chat.postMessage({
              channel: user.slack_user_id, // DM
              text: "Friendly reminder: you haven't submitted today's update yet. Run `/update` when you get a chance.",
            });
          } catch (err) {
            console.error(`Reminder failed for ${user.slack_user_id}:`, err.message);
          }
        }
      }
    },
    { timezone: process.env.TZ || 'UTC' }
  );
}

// --- start ----------------------------------------------------------------

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Redmine standup bot running on port ${port}`);
})();
