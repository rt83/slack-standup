import { describe, expect, it, vi } from 'vitest';
import type { LinkedUser } from '../lib/userStore.ts';
import { REMINDER_TEXT, ReminderJob, type DirectMessenger } from './reminderJob.ts';

const user = (slackUserId: string): LinkedUser => ({
  slackUserId,
  redmineUserId: 1,
  redmineApiKey: 'key',
  displayName: slackUserId,
});

describe('ReminderJob', () => {
  it('DMs only the people who have not submitted today, and carries on past a failed DM', async () => {
    const sent: string[] = [];
    const messenger: DirectMessenger = {
      async sendDirectMessage(slackUserId, text) {
        expect(text).toBe(REMINDER_TEXT);
        if (slackUserId === 'U2') throw new Error('channel_not_found');
        sent.push(slackUserId);
      },
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const job = new ReminderJob(
      { list: () => ['U1', 'U2', 'U3', 'U4'].map(user) },
      { submittersToday: () => new Set(['U1']) },
      messenger
    );
    await job.run();

    expect(sent).toEqual(['U3', 'U4']);
    expect(errors).toHaveBeenCalledOnce();
    errors.mockRestore();
  });
});
