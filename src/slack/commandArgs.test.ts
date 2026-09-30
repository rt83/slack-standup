import { describe, expect, it } from 'vitest';
import { parseDashboardArgs } from './dashboardCommand.ts';
import { parseLinkRedmineArgs } from './linkRedmineCommand.ts';
import { parseMention } from './mentions.ts';

describe('parseMention', () => {
  it('reads the user id from both escaped forms, and nothing from plain text', () => {
    expect(parseMention('<@U0123ABC>')).toBe('U0123ABC');
    expect(parseMention('<@U0123ABC|jane>')).toBe('U0123ABC');
    expect(parseMention('@jane')).toBeNull();
    expect(parseMention('<#C0123|general>')).toBeNull();
  });
});

describe('parseDashboardArgs', () => {
  it('reads the team view, a person, or nothing valid', () => {
    expect(parseDashboardArgs('')).toEqual({ kind: 'team' });
    expect(parseDashboardArgs('  ')).toEqual({ kind: 'team' });
    expect(parseDashboardArgs('--p <@UJANE|jane>')).toEqual({ kind: 'person', slackUserId: 'UJANE' });
    expect(parseDashboardArgs('--p jane')).toBeNull();
    expect(parseDashboardArgs('--p <@UJANE> extra')).toBeNull();
    expect(parseDashboardArgs('hello')).toBeNull();
  });
});

describe('parseLinkRedmineArgs', () => {
  it('reads a mention, a numeric Redmine id and a key', () => {
    expect(parseLinkRedmineArgs('<@UJANE|jane> 42 abcdef0123')).toEqual({
      slackUserId: 'UJANE',
      redmineUserId: 42,
      redmineApiKey: 'abcdef0123',
    });
  });

  it('refuses anything missing or malformed', () => {
    expect(parseLinkRedmineArgs('')).toBeNull();
    expect(parseLinkRedmineArgs('@jane 42 key')).toBeNull();
    expect(parseLinkRedmineArgs('<@UJANE> forty-two key')).toBeNull();
    expect(parseLinkRedmineArgs('<@UJANE> 42')).toBeNull();
    expect(parseLinkRedmineArgs('<@UJANE> 42 key extra')).toBeNull();
  });
});
