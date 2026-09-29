import type { App } from '@slack/bolt';
import type { UserStore } from '../lib/userStore.ts';
import type { DashboardScope } from '../web/dashboard.ts';
import { dashboardUrl } from '../web/server.ts';
import { parseMention } from './mentions.ts';

export const DASHBOARD_USAGE = 'Usage: `/dashboard` or `/dashboard --p @person`';

/** `/dashboard` is the team; `/dashboard --p @jane` is Jane. Anything else is null. */
export function parseDashboardArgs(text: string): DashboardScope | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { kind: 'team' };
  const slackUserId = words.length === 2 && words[0] === '--p' ? parseMention(words[1] ?? '') : null;
  return slackUserId ? { kind: 'person', slackUserId } : null;
}

/**
 * `/dashboard` replies with a button linking to the web dashboard. A bot cannot open a
 * browser itself; a `url` button opens in the person's own.
 */
export function registerDashboardCommand(app: App, users: Pick<UserStore, 'find'>, publicUrl: string): void {
  app.command('/dashboard', async ({ ack, body, respond }) => {
    await ack();
    const scope = parseDashboardArgs(body.text);
    if (!scope) {
      await respond(DASHBOARD_USAGE);
      return;
    }

    let heading = 'Team dashboard:';
    let label = 'Open team dashboard';
    if (scope.kind === 'person') {
      const user = users.find(scope.slackUserId);
      if (!user) {
        await respond(`<@${scope.slackUserId}> isn't linked to Redmine yet — nothing to show.`);
        return;
      }
      heading = `Dashboard for <@${scope.slackUserId}>:`;
      label = `Open ${user.displayName} dashboard`;
    }

    await respond({
      text: label,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: heading },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: label },
            url: dashboardUrl(publicUrl, scope),
            action_id: 'noop_dashboard_link', // required even on a url button; never handled
          },
        },
      ],
    });
  });
}
