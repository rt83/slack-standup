import 'dotenv/config';
import path from 'node:path';
import { App, ExpressReceiver } from '@slack/bolt';
import cron from 'node-cron';
import { loadConfig } from './config.ts';
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

const config = loadConfig(process.env);

const calendar = new Calendar(config.timeZone);
const db = openDatabase(config.dbPath);
const users = new UserStore(db);
const submissions = new SubmissionStore(db, calendar);
const tracker = new RedmineClient(config.redmineBaseUrl);
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
registerDashboardCommand(app, users, config.publicUrl);
registerLinkRedmineCommand(app, users);

if (config.reminderCron) {
  const reminder = new ReminderJob(users, submissions, new SlackMessenger(app.client));
  cron.schedule(config.reminderCron, () => reminder.run(), { timezone: calendar.timeZone });
}

await app.start(config.port);
console.log(`⚡️ Redmine standup bot running on port ${config.port}`);
