import type { App, BlockAction, ExternalSelectAction } from '@slack/bolt';
import type { UserStore } from '../lib/userStore.ts';
import {
  ADD_ISSUE_ACTION_ID,
  OPEN_FORM_ACTION_ID,
  STANDUP_CALLBACK_ID,
  buildHomeView,
  buildNotLinkedView,
  buildStandupView,
  readStandupForm,
  sectionOfAddIssueBlock,
} from '../standup/standupForm.ts';
import type { StandupService } from '../standup/standupService.ts';
import type { IssueTracker } from '../lib/redmineClient.ts';

/** Slack caps an option's text at 75 characters. */
const OPTION_TEXT_LIMIT = 75;

export interface StandupHandlerDeps {
  readonly users: Pick<UserStore, 'find'>;
  readonly standup: StandupService;
  readonly tracker: Pick<IssueTracker, 'searchIssues'>;
  /** Channel finished reports go to; undefined means they are not posted. */
  readonly updatesChannel: string | undefined;
}

/** Wires the standup form into Slack: how it opens, the issue search, adding an issue, submitting. */
export function registerStandupHandlers(app: App, deps: StandupHandlerDeps): void {
  const { users, standup, tracker, updatesChannel } = deps;

  const openForm = async (client: App['client'], triggerId: string, slackUserId: string): Promise<void> => {
    const user = users.find(slackUserId);
    const view = user ? buildStandupView(await standup.openForm(user)) : buildNotLinkedView();
    await client.views.open({ trigger_id: triggerId, view });
  };

  app.command('/update', async ({ ack, body, client }) => {
    await ack();
    await openForm(client, body.trigger_id, body.user_id);
  });

  app.action<BlockAction>(OPEN_FORM_ACTION_ID, async ({ ack, body, client }) => {
    await ack();
    await openForm(client, body.trigger_id, body.user.id);
  });

  app.event('app_home_opened', async ({ event, client }) => {
    await client.views.publish({ user_id: event.user, view: buildHomeView() });
  });

  app.options(ADD_ISSUE_ACTION_ID, async ({ options, ack, body }) => {
    const user = users.find(body.user.id);
    const query = options.value.trim();
    if (!user || !query) {
      await ack({ options: [] });
      return;
    }
    try {
      const issues = await tracker.searchIssues(user.redmineApiKey, query);
      await ack({
        options: issues.map((issue) => ({
          text: { type: 'plain_text', text: `#${issue.id} ${issue.subject}`.slice(0, OPTION_TEXT_LIMIT) },
          value: String(issue.id),
        })),
      });
    } catch (err) {
      console.error('Issue search failed:', err instanceof Error ? err.message : err);
      await ack({ options: [] });
    }
  });

  app.action<BlockAction<ExternalSelectAction>>(
    { action_id: ADD_ISSUE_ACTION_ID },
    async ({ ack, body, action, client }) => {
      await ack();
      const user = users.find(body.user.id);
      const section = sectionOfAddIssueBlock(action.block_id);
      const picked = action.selected_option?.value;
      if (!user || !section || !picked || !body.view) return;

      const state = readStandupForm(body.view.state.values, body.view.private_metadata);
      const content = await standup.addIssue(user, state, section, Number(picked));
      // views.update replaces the whole view; the draft in `state` carries typed notes
      // and picked statuses into the new one.
      await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildStandupView(content) });
    }
  );

  app.view(STANDUP_CALLBACK_ID, async ({ ack, body, view, client }) => {
    await ack();
    const user = users.find(body.user.id);
    if (!user) return; // the form only opens for linked users

    const { entries } = readStandupForm(view.state.values, view.private_metadata);
    const { reportText, failedIssueIds } = await standup.submit(user, entries, view.state.values);
    for (const issueId of failedIssueIds) {
      console.error(`Redmine update failed for issue #${issueId} (details in submission_items.redmine_error)`);
    }
    if (updatesChannel) {
      await client.chat.postMessage({ channel: updatesChannel, text: reportText, mrkdwn: true });
    }
  });
}
