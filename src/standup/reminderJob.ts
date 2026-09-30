import type { SubmissionStore } from '../lib/submissionStore.ts';
import type { UserStore } from '../lib/userStore.ts';

export interface DirectMessenger {
  sendDirectMessage(slackUserId: string, text: string): Promise<void>;
}

export const REMINDER_TEXT =
  "Friendly reminder: you haven't submitted today's update yet. Run `/update` when you get a chance.";

/** DMs every linked person who has not submitted an update today. */
export class ReminderJob {
  readonly #users: Pick<UserStore, 'list'>;
  readonly #submissions: Pick<SubmissionStore, 'submittersToday'>;
  readonly #messenger: DirectMessenger;

  constructor(
    users: Pick<UserStore, 'list'>,
    submissions: Pick<SubmissionStore, 'submittersToday'>,
    messenger: DirectMessenger
  ) {
    this.#users = users;
    this.#submissions = submissions;
    this.#messenger = messenger;
  }

  /** Sends the reminders. One failed DM is logged and does not stop the rest. */
  async run(): Promise<void> {
    const submitted = this.#submissions.submittersToday();
    for (const user of this.#users.list()) {
      if (submitted.has(user.slackUserId)) continue;
      try {
        await this.#messenger.sendDirectMessage(user.slackUserId, REMINDER_TEXT);
      } catch (err) {
        console.error(`Reminder failed for ${user.slackUserId}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}
