import type { App } from '@slack/bolt';
import type { UserStore } from '../lib/userStore.ts';
import { parseMention } from './mentions.ts';

export const LINK_REDMINE_USAGE = 'Usage: `/link-redmine @user <redmine_user_id> <redmine_api_key>`';

export interface LinkRedmineArgs {
  readonly slackUserId: string;
  readonly redmineUserId: number;
  readonly redmineApiKey: string;
}

/** Parses `@user <redmine_user_id> <api_key>`; null if any part is missing or malformed. */
export function parseLinkRedmineArgs(text: string): LinkRedmineArgs | null {
  const [mention, userId, apiKey, ...rest] = text.trim().split(/\s+/);
  const slackUserId = parseMention(mention ?? '');
  if (!slackUserId || !userId || !/^\d+$/.test(userId) || !apiKey || rest.length > 0) return null;
  return { slackUserId, redmineUserId: Number(userId), redmineApiKey: apiKey };
}

/**
 * `/link-redmine @user <redmine_user_id> <api_key>` links a Slack user to their Redmine
 * account. Anyone who can run it can attribute Redmine writes to someone else's account:
 * check `body.user_id` against an admin allowlist before using this in production.
 */
export function registerLinkRedmineCommand(app: App, users: Pick<UserStore, 'link'>): void {
  app.command('/link-redmine', async ({ ack, body, client, respond }) => {
    await ack();
    const args = parseLinkRedmineArgs(body.text);
    if (!args) {
      await respond(LINK_REDMINE_USAGE);
      return;
    }
    const info = await client.users.info({ user: args.slackUserId });
    users.link({ ...args, displayName: info.user?.real_name || args.slackUserId });
    await respond(`Linked <@${args.slackUserId}> to Redmine user #${args.redmineUserId}.`);
  });
}
