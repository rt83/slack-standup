import { SECTIONS, SECTION_TITLES, type StandupEntry } from './types.ts';

/** The Slack-mrkdwn report posted to the updates channel. */
export function formatReport(slackUserId: string, entries: readonly StandupEntry[]): string {
  const line = (e: StandupEntry): string =>
    `  ${e.origin === 'added' ? '🆕' : '📋'} #${e.issueId}: ${e.notes || '_no notes_'}` +
    (e.newStatusId === null ? '' : ` _(status → ${e.newStatusId})_`);

  const sections = SECTIONS.map((section) => {
    const lines = entries.filter((e) => e.section === section).map(line);
    return `*${SECTION_TITLES[section]}:*\n${lines.join('\n') || '  _none_'}`;
  });
  return [`*Daily Update from <@${slackUserId}>*`, ...sections].join('\n\n');
}

/** The journal comment written to Redmine for one entry. */
export function formatIssueNote(entry: StandupEntry): string {
  return `[Daily Update - ${SECTION_TITLES[entry.section]}]\n${entry.notes}`;
}
