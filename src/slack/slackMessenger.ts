import type { App } from '@slack/bolt';
import type { DirectMessenger } from '../standup/reminderJob.ts';

/** DirectMessenger over the Slack Web API; a DM is a message posted to the user's id. */
export class SlackMessenger implements DirectMessenger {
  readonly #client: App['client'];

  constructor(client: App['client']) {
    this.#client = client;
  }

  async sendDirectMessage(slackUserId: string, text: string): Promise<void> {
    await this.#client.chat.postMessage({ channel: slackUserId, text });
  }
}
