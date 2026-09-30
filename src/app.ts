import path from 'node:path';
import { App, ExpressReceiver } from '@slack/bolt';
import cron from 'node-cron';
import { CONF_DIR, loadConfigFrom } from './config.ts';
import { Calendar } from './lib/calendar.ts';
import { openDatabase } from './lib/db.ts';
import { RedmineClient } from './lib/redmineClient.ts';
import { SubmissionStore } from './lib/submissionStore.ts';
import { UserStore } from './lib/userStore.ts';
import { registerDashboardCommand } from './slack/dashboardCommand.ts';
import { registerLinkRedmineCommand } from './slack/linkRedmineCommand.ts';
import { SlackMessenger } from './slack/slackMessenger.ts';
import { registerStandupHandlers } from './slack/standupHandlers.ts';
import { ReminderJob } from './standup/reminderJob.ts';
import { StandupService } from './standup/standupService.ts';
import { DashboardService } from './web/dashboard.ts';
import { registerDashboardRoutes } from './web/server.ts';

// The composition root: the only place concrete collaborators are built and wired.

const config = loadConfigFrom(path.resolve(CONF_DIR));

const calendar = new Calendar(config.timeZone);
const db = openDatabase(config.database.path);
const users = new UserStore(db);
const submissions = new SubmissionStore(db, calendar);
const tracker = new RedmineClient(config.redmine.baseUrl);
const standup = new StandupService(tracker, submissions);

// ExpressReceiver rather than Bolt's default, so the dashboard shares Slack's server and port.
const receiver = new ExpressReceiver({ signingSecret: config.slack.signingSecret });
registerDashboardRoutes(
  receiver.router,
  new DashboardService(users, submissions, calendar.timeZone),
  path.resolve(import.meta.dirname, '../dist/dashboard')
);

const app = new App({ token: config.slack.botToken, receiver });
registerStandupHandlers(app, { users, standup, tracker, updatesChannel: config.slack.updatesChannel });
registerDashboardCommand(app, users, config.server.publicUrl);
registerLinkRedmineCommand(app, users);

if (config.reminder.cron) {
  const reminder = new ReminderJob(users, submissions, new SlackMessenger(app.client));
  cron.schedule(config.reminder.cron, () => reminder.run(), { timezone: calendar.timeZone });
}

await app.start(config.server.port);
console.log(`⚡️ Redmine standup bot running on port ${config.server.port}`);
