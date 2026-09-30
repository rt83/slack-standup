import type { ViewOutput, types } from '@slack/bolt';
import { z } from 'zod';
import type { Issue, IssueStatus } from '../lib/redmineClient.ts';
import { SECTIONS, SECTION_TITLES, type IssueOrigin, type Section, type StandupEntry } from './types.ts';

/**
 * The standup modal's wire format. Everything that names a block or action, and the
 * metadata carried between renders, is defined here and nowhere else, so building the
 * view and reading it back cannot drift apart.
 */

export const STANDUP_CALLBACK_ID = 'standup_submit';
export const OPEN_FORM_ACTION_ID = 'open_standup_modal';
export const ADD_ISSUE_ACTION_ID = 'add_issue_select';
const NOTES_ACTION_ID = 'notes_input';
const STATUS_ACTION_ID = 'status_select';

type ViewStateValues = ViewOutput['state']['values'];
type KnownBlock = types.KnownBlock;
type ModalView = types.ModalView;
type HomeView = types.HomeView;
type PlainTextOption = types.PlainTextOption;
type IssueField = 'header' | 'notes' | 'status';

function issueBlockId(section: Section, issueId: number, field: IssueField): string {
  return `${section}_issue_${issueId}_${field}`;
}

function addIssueBlockId(section: Section): string {
  return `${section}_add_issue`;
}

/** The section whose add-issue box a block id names, or null if it names none. */
export function sectionOfAddIssueBlock(blockId: string): Section | null {
  return SECTIONS.find((section) => addIssueBlockId(section) === blockId) ?? null;
}

/**
 * Carried in `private_metadata`, because Slack returns only input values, not which
 * issues were added by hand. The shape predates this module; keeping it means a modal
 * left open across a deploy still submits.
 */
const metadataSchema = z.object({
  did: z.object({ manualIds: z.array(z.number()) }),
  doing: z.object({ manualIds: z.array(z.number()) }),
});

/** Issue ids added by hand, per section. */
export type AddedIssueIds = Readonly<Record<Section, readonly number[]>>;

export const NO_ADDED_ISSUES: AddedIssueIds = { did: [], doing: [] };

export interface StandupFormContent {
  /** The person's open issues. The same list seeds both sections. */
  readonly assigned: readonly Issue[];
  /** Issues added by hand, per section, none of them also in `assigned`. */
  readonly added: Readonly<Record<Section, readonly Issue[]>>;
  /** Offered for an issue whose workflow-legal statuses Redmine did not return. */
  readonly fallbackStatuses: readonly IssueStatus[];
  /** What was already typed or picked, restored when the form is re-rendered. */
  readonly draft: readonly StandupEntry[];
}

/** The standup modal; its blocks are all Block Kit's known kinds, so callers can narrow them. */
export type StandupView = Omit<ModalView, 'blocks'> & { blocks: KnownBlock[] };

/** What a submitted or re-rendered modal holds. */
export interface StandupFormState {
  readonly added: AddedIssueIds;
  readonly entries: StandupEntry[];
}

export function buildStandupView(content: StandupFormContent): StandupView {
  const metadata: z.infer<typeof metadataSchema> = {
    did: { manualIds: content.added.did.map((i) => i.id) },
    doing: { manualIds: content.added.doing.map((i) => i.id) },
  };
  const draftOf = (section: Section, issueId: number): StandupEntry | undefined =>
    content.draft.find((e) => e.section === section && e.issueId === issueId);

  const blocks = SECTIONS.flatMap((section): KnownBlock[] => {
    const rows = (issues: readonly Issue[], origin: IssueOrigin): KnownBlock[] =>
      issues.flatMap((issue) =>
        issueBlocks(section, issue, origin, content.fallbackStatuses, draftOf(section, issue.id))
      );
    const added = content.added[section];
    const addedRows: KnownBlock[] = added.length
      ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: '*Manually added*' }] }, ...rows(added, 'added')]
      : [];
    return [
      { type: 'header', text: { type: 'plain_text', text: SECTION_TITLES[section] } },
      ...rows(content.assigned, 'assigned'),
      ...addedRows,
      {
        type: 'actions',
        block_id: addIssueBlockId(section),
        elements: [
          {
            type: 'external_select',
            action_id: ADD_ISSUE_ACTION_ID,
            placeholder: { type: 'plain_text', text: '+ Add issue by number or title' },
            min_query_length: 1,
          },
        ],
      },
    ];
  });

  return {
    type: 'modal',
    callback_id: STANDUP_CALLBACK_ID,
    title: { type: 'plain_text', text: 'Daily Update' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    private_metadata: JSON.stringify(metadata),
    blocks,
  };
}

/** The app's Home tab: a button that opens the form. */
export function buildHomeView(): HomeView {
  return {
    type: 'home',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: '*Daily Update*' } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Submit Daily Update' },
            action_id: OPEN_FORM_ACTION_ID,
            style: 'primary',
          },
        ],
      },
    ],
  };
}

/** Shown instead of the form to someone with no linked Redmine account. */
export function buildNotLinkedView(): ModalView {
  return {
    type: 'modal',
    title: { type: 'plain_text', text: 'Daily Update' },
    close: { type: 'plain_text', text: 'Close' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ":warning: Your Slack account isn't linked to Redmine yet. Ask an admin to run `/link-redmine` for you.",
        },
      },
    ],
  };
}

export function readStandupForm(values: ViewStateValues, privateMetadata: string): StandupFormState {
  const metadata = metadataSchema.parse(JSON.parse(privateMetadata));
  const added: AddedIssueIds = { did: metadata.did.manualIds, doing: metadata.doing.manualIds };

  const entries: StandupEntry[] = [];
  for (const blockId of Object.keys(values)) {
    const match = /^(\w+)_issue_(\d+)_notes$/.exec(blockId);
    const section = SECTIONS.find((s) => s === match?.[1]);
    if (!match || !section) continue;
    const issueId = Number(match[2]);
    const selectedStatus =
      values[issueBlockId(section, issueId, 'status')]?.[STATUS_ACTION_ID]?.selected_option?.value;
    entries.push({
      section,
      issueId,
      origin: added[section].includes(issueId) ? 'added' : 'assigned',
      notes: values[blockId]?.[NOTES_ACTION_ID]?.value ?? '',
      newStatusId: selectedStatus ? Number(selectedStatus) : null,
    });
  }
  return { added, entries };
}

function issueBlocks(
  section: Section,
  issue: Issue,
  origin: IssueOrigin,
  fallbackStatuses: readonly IssueStatus[],
  draft: StandupEntry | undefined
): KnownBlock[] {
  // Block Kit has no text colour, so hand-added issues are told apart by emoji and by
  // sitting under their own "Manually added" divider.
  const emoji = origin === 'added' ? '🆕' : '📋';
  const statusOptions = (issue.allowedStatuses?.length ? issue.allowedStatuses : fallbackStatuses).map(
    (s): PlainTextOption => ({ text: { type: 'plain_text', text: s.name }, value: String(s.id) })
  );
  const pickedStatus = statusOptions.find((o) => o.value === String(draft?.newStatusId));

  return [
    {
      type: 'section',
      block_id: issueBlockId(section, issue.id, 'header'),
      text: { type: 'mrkdwn', text: `${emoji} *#${issue.id} ${issue.subject}*  _(${issue.projectName})_` },
    },
    {
      type: 'input',
      block_id: issueBlockId(section, issue.id, 'notes'),
      label: {
        type: 'plain_text',
        text: section === 'did' ? 'Details / blocker / remaining work' : 'Problem / tackling / plan',
      },
      element: {
        type: 'plain_text_input',
        multiline: true,
        action_id: NOTES_ACTION_ID,
        ...(draft?.notes ? { initial_value: draft.notes } : {}),
      },
    },
    {
      type: 'input',
      block_id: issueBlockId(section, issue.id, 'status'),
      optional: true,
      label: { type: 'plain_text', text: 'Change status (optional)' },
      element: {
        type: 'static_select',
        action_id: STATUS_ACTION_ID,
        placeholder: { type: 'plain_text', text: issue.status.name },
        options: statusOptions,
        ...(pickedStatus ? { initial_option: pickedStatus } : {}),
      },
    },
    { type: 'divider' },
  ];
}
