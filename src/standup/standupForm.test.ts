import type { ViewOutput } from '@slack/bolt';
import { describe, expect, it } from 'vitest';
import type { Issue } from '../lib/redmineClient.ts';
import {
  NO_ADDED_ISSUES,
  buildStandupView,
  readStandupForm,
  sectionOfAddIssueBlock,
  type StandupFormContent,
  type StandupView,
} from './standupForm.ts';

const issue = (id: number, allowed: Issue['allowedStatuses'] = null): Issue => ({
  id,
  subject: `Issue ${id}`,
  status: { id: 1, name: 'New' },
  projectName: 'Paginary',
  allowedStatuses: allowed,
});

const content = (overrides: Partial<StandupFormContent> = {}): StandupFormContent => ({
  assigned: [issue(1)],
  added: { did: [], doing: [] },
  fallbackStatuses: [
    { id: 1, name: 'New' },
    { id: 5, name: 'Closed' },
  ],
  draft: [],
  ...overrides,
});

type StateValues = ViewOutput['state']['values'];

/** What Slack sends back for a view: each input's value, keyed by block and action id. */
function slackState(view: StandupView, fill: (blockId: string) => string | undefined): StateValues {
  const values: StateValues = {};
  for (const block of view.blocks) {
    if (block.type !== 'input' || !block.block_id) continue;
    const typed = fill(block.block_id);
    const element = block.element;
    if (element.type === 'plain_text_input' && element.action_id) {
      values[block.block_id] = { [element.action_id]: { type: element.type, value: typed ?? null } };
    } else if (element.type === 'static_select' && element.action_id) {
      const option = element.options?.find((o) => o.value === typed);
      values[block.block_id] = {
        [element.action_id]: {
          type: element.type,
          selected_option: option ? { text: { type: 'plain_text', text: 'x' }, value: option.value ?? '' } : null,
        },
      };
    }
  }
  return values;
}

const blockIds = (view: StandupView) => view.blocks.map((b) => b.block_id).filter(Boolean);

describe('standup form', () => {
  it('reads back what was typed into each section, with the origin of each issue', () => {
    const view = buildStandupView(content({ added: { did: [], doing: [issue(9)] } }));
    const state = slackState(view, (id) =>
      ({ did_issue_1_notes: 'Shipped it', did_issue_1_status: '5', doing_issue_1_notes: 'Reviews', doing_issue_9_notes: 'Spike' })[id]
    );

    const form = readStandupForm(state, view.private_metadata ?? '');
    expect(form.added).toEqual({ did: [], doing: [9] });
    expect(form.entries).toEqual([
      { section: 'did', issueId: 1, origin: 'assigned', notes: 'Shipped it', newStatusId: 5 },
      { section: 'doing', issueId: 1, origin: 'assigned', notes: 'Reviews', newStatusId: null },
      { section: 'doing', issueId: 9, origin: 'added', notes: 'Spike', newStatusId: null },
    ]);
  });

  it('restores a draft on re-render: notes and the picked status', () => {
    const view = buildStandupView(
      content({ draft: [{ section: 'did', issueId: 1, origin: 'assigned', notes: 'Half done', newStatusId: 5 }] })
    );
    const notes = view.blocks.find((b) => b.block_id === 'did_issue_1_notes');
    const status = view.blocks.find((b) => b.block_id === 'did_issue_1_status');
    expect(notes?.type === 'input' && notes.element.type === 'plain_text_input' && notes.element.initial_value).toBe('Half done');
    expect(status?.type === 'input' && status.element.type === 'static_select' && status.element.initial_option?.value).toBe('5');
  });

  it("offers an issue's own workflow statuses, falling back to the global list", () => {
    const view = buildStandupView(content({ assigned: [issue(1, [{ id: 2, name: 'In Progress' }]), issue(3)] }));
    const optionsOf = (blockId: string) => {
      const block = view.blocks.find((b) => b.block_id === blockId);
      return block?.type === 'input' && block.element.type === 'static_select'
        ? block.element.options?.map((o) => o.value)
        : undefined;
    };
    expect(optionsOf('did_issue_1_status')).toEqual(['2']);
    expect(optionsOf('did_issue_3_status')).toEqual(['1', '5']);
  });

  it('gives every block a unique id', () => {
    const ids = blockIds(buildStandupView(content({ assigned: [issue(1), issue(2)], added: { did: [issue(3)], doing: [issue(3)] } })));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names the section of each add-issue box, and nothing else's", () => {
    const ids = blockIds(buildStandupView(content()));
    expect(ids.map((id) => id && sectionOfAddIssueBlock(id)).filter(Boolean)).toEqual(['did', 'doing']);
    expect(sectionOfAddIssueBlock('did_issue_1_notes')).toBeNull();
  });

  it('refuses metadata it did not write', () => {
    expect(() => readStandupForm({}, '{"did":[]}')).toThrow();
    expect(readStandupForm({}, JSON.stringify({ did: { manualIds: [] }, doing: { manualIds: [] } })).added).toEqual(NO_ADDED_ISSUES);
  });
});
