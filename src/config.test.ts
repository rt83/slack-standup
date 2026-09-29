import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadConfigFrom, parseConfig, readConfFile, serverPortIn } from './config.ts';

const required = {
  slack: { botToken: 'xoxb-1', signingSecret: 'secret' },
  redmine: { baseUrl: 'https://redmine.example.com' },
};

describe('parseConfig', () => {
  it('fills defaults, and treats empty optional values as unset', () => {
    const config = parseConfig({ ...required, slack: { ...required.slack, updatesChannel: null }, reminder: { cron: ' ' } });
    expect(config).toEqual({
      slack: { botToken: 'xoxb-1', signingSecret: 'secret', updatesChannel: undefined },
      redmine: { baseUrl: 'https://redmine.example.com' },
      server: { port: 3000, publicUrl: 'http://localhost:3000' },
      database: { path: './data/app.db' },
      reminder: { cron: undefined },
      timeZone: 'UTC',
    });
  });

  it('reads the values it is given', () => {
    const config = parseConfig({
      ...required,
      server: { port: 8080, publicUrl: 'https://standup.example.com/' },
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(config.server).toEqual({ port: 8080, publicUrl: 'https://standup.example.com' });
    expect(config.timeZone).toBe('Asia/Ho_Chi_Minh');
  });

  it('names every missing or invalid setting by its path', () => {
    const error = (() => {
      try {
        parseConfig({ redmine: { baseUrl: 'not a url' }, timeZone: 'Mars/Olympus' });
      } catch (err) {
        return String(err);
      }
      return '';
    })();
    expect(error).toContain('at slack');
    expect(error).toContain('at redmine.baseUrl');
    expect(error).toContain('at timeZone');
  });

  it('refuses an unknown key, which is usually a typo', () => {
    expect(() => parseConfig({ ...required, server: { prot: 3000 } })).toThrow(/prot/);
    expect(() => parseConfig({ ...required, timezone: 'UTC' })).toThrow(/timezone/);
  });
});

describe('conf folder', () => {
  const dirs: string[] = [];
  const confDir = (contents?: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-'));
    dirs.push(dir);
    if (contents !== undefined) fs.writeFileSync(path.join(dir, 'app.yaml'), contents);
    return dir;
  };
  afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

  it('loads app.yaml', () => {
    const config = loadConfigFrom(confDir(stringify({ ...required, server: { port: 4000 } })));
    expect(config.slack.botToken).toBe('xoxb-1');
    expect(config.server.port).toBe(4000);
  });

  it('says where the file should be when there is none', () => {
    const empty = confDir();
    expect(readConfFile(empty)).toBeNull();
    expect(() => loadConfigFrom(empty)).toThrow(/app\.yaml[\s\S]*conf-sample/);
  });

  it('reads the dev port from a file that is not finished yet', () => {
    expect(serverPortIn(readConfFile(confDir('server:\n  port: 4321\nslack:\n  botToken:\n')))).toBe(4321);
    expect(serverPortIn(readConfFile(confDir('')))).toBe(3000);
    expect(serverPortIn(null)).toBe(3000);
  });

  it('ships a sample that is valid and sets every setting the app reads', () => {
    const sample = readConfFile(path.resolve('conf-sample'));
    const config = parseConfig(sample);
    const leaves = (value: unknown, prefix = ''): string[] =>
      value !== null && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => leaves(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(leaves(sample).sort()).toEqual(leaves(config).sort());
  });
});
