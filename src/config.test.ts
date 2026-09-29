import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG_KEYS, loadConfig, loadConfigFrom, readConfFile } from './config.ts';

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

describe('loadConfigFrom', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads app.env, and lets the real environment override it', () => {
    fs.writeFileSync(
      path.join(dir, 'app.env'),
      Object.entries({ ...required, PORT: '4000', TZ: 'Asia/Ho_Chi_Minh' })
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')
    );
    const config = loadConfigFrom(dir, { PORT: '5000' });
    expect(config.slack.botToken).toBe('xoxb-1');
    expect(config.timeZone).toBe('Asia/Ho_Chi_Minh');
    expect(config.port).toBe(5000);
  });

  it('says where the file should be when there is none', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-empty-'));
    expect(readConfFile(empty)).toBeNull();
    expect(() => loadConfigFrom(empty, {})).toThrow(/app\.env[\s\S]*conf-sample/);
    fs.rmSync(empty, { recursive: true });
  });

  it('ships a sample that has every setting the app reads', () => {
    const sample = readConfFile(path.resolve('conf-sample'));
    expect(Object.keys(sample ?? {}).sort()).toEqual([...CONFIG_KEYS].sort());
    expect(() => loadConfig(sample ?? {})).not.toThrow();
  });
});
