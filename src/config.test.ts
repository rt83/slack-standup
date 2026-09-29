import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const required = {
  SLACK_BOT_TOKEN: 'xoxb-1',
  SLACK_SIGNING_SECRET: 'secret',
  REDMINE_BASE_URL: 'https://redmine.example.com',
};

describe('loadConfig', () => {
  it('fills defaults, and treats blank optional values as unset', () => {
    const config = loadConfig({ ...required, SLACK_UPDATES_CHANNEL: '', SUBMISSION_REMINDER_CRON: ' ' });
    expect(config).toEqual({
      slack: { botToken: 'xoxb-1', signingSecret: 'secret', updatesChannel: undefined },
      redmineBaseUrl: 'https://redmine.example.com',
      port: 3000,
      publicUrl: 'http://localhost:3000',
      dbPath: './data/app.db',
      reminderCron: undefined,
      timeZone: 'UTC',
    });
  });

  it('reads the values it is given', () => {
    const config = loadConfig({ ...required, PORT: '8080', PUBLIC_URL: 'https://standup.example.com/', TZ: 'Asia/Ho_Chi_Minh' });
    expect(config.port).toBe(8080);
    expect(config.publicUrl).toBe('https://standup.example.com');
    expect(config.timeZone).toBe('Asia/Ho_Chi_Minh');
  });

  it('names every missing or invalid variable', () => {
    expect(() => loadConfig({ TZ: 'Mars/Olympus', REDMINE_BASE_URL: 'not a url' })).toThrow(
      /SLACK_BOT_TOKEN[\s\S]*SLACK_SIGNING_SECRET[\s\S]*REDMINE_BASE_URL[\s\S]*TZ/
    );
  });
});
