import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '../lib/calendar.ts';
import { openDatabase } from '../lib/db.ts';
import type { Issue, IssueStatus, IssueSummary, IssueTracker, IssueUpdate } from '../lib/redmineClient.ts';
import { SubmissionStore } from '../lib/submissionStore.ts';
import type { LinkedUser } from '../lib/userStore.ts';
import { StandupService } from './standupService.ts';
import type { StandupEntry } from './types.ts';

const issue = (id: number): Issue => ({
  id,
  subject: `Issue ${id}`,
  status: { id: 1, name: 'New' },
  projectName: 'Paginary',
  allowedStatuses: null,
});

class FakeTracker implements IssueTracker {
  assigned: Issue[] = [issue(1), issue(2)];
  readonly fetched: number[] = [];
  readonly updates: { apiKey: string; issueId: number; update: IssueUpdate }[] = [];
  failingIssueIds = new Set<number>();

  async listAssignedOpenIssues(): Promise<Issue[]> {
    return this.assigned;
  }
  async searchIssues(): Promise<IssueSummary[]> {
    return [];
  }
  async getIssue(_apiKey: string, issueId: number): Promise<Issue> {
    this.fetched.push(issueId);
    return issue(issueId);
  }
  async listStatuses(): Promise<readonly IssueStatus[]> {
    return [{ id: 1, name: 'New' }];
  }
  async updateIssue(apiKey: string, issueId: number, update: IssueUpdate): Promise<void> {
    if (this.failingIssueIds.has(issueId)) throw new Error(`Redmine said no to #${issueId}`);
    this.updates.push({ apiKey, issueId, update });
  }
}

const jane: LinkedUser = { slackUserId: 'UJANE', redmineUserId: 42, redmineApiKey: 'jane-key', displayName: 'Jane' };

const entry = (overrides: Partial<StandupEntry>): StandupEntry => ({
  section: 'did',
  issueId: 1,
  origin: 'assigned',
  notes: 'notes',
  newStatusId: null,
  ...overrides,
});

describe('StandupService', () => {
  let tracker: FakeTracker;
  let store: SubmissionStore;
  let service: StandupService;

  beforeEach(() => {
    tracker = new FakeTracker();
    store = new SubmissionStore(openDatabase(':memory:'), new Calendar('UTC'));
    service = new StandupService(tracker, store);
  });

  it('opens the form with the assigned issues and nothing added', async () => {
    const form = await service.openForm(jane);
    expect(form.assigned.map((i) => i.id)).toEqual([1, 2]);
    expect(form.added).toEqual({ did: [], doing: [] });
    expect(form.draft).toEqual([]);
  });

  it('adds an issue to one section and keeps the draft', async () => {
    const draft = [entry({ notes: 'typed already' })];
    const form = await service.addIssue(jane, { added: { did: [], doing: [7] }, entries: draft }, 'did', 8);
    expect(form.added.did.map((i) => i.id)).toEqual([8]);
    expect(form.added.doing.map((i) => i.id)).toEqual([7]);
    expect(form.draft).toBe(draft);
  });

  it('does not add an issue that is already on the list', async () => {
    const once = await service.addIssue(jane, { added: { did: [7], doing: [] }, entries: [] }, 'did', 7);
    expect(once.added.did.map((i) => i.id)).toEqual([7]);
    const assigned = await service.addIssue(jane, { added: { did: [], doing: [] }, entries: [] }, 'did', 2);
    expect(assigned.added.did).toEqual([]);
  });

  it('fetches an issue added to both sections once', async () => {
    await service.addIssue(jane, { added: { did: [7], doing: [] }, entries: [] }, 'doing', 7);
    expect(tracker.fetched).toEqual([7]);
  });

  it("writes each entry to Redmine under the person's own key, and records it", async () => {
    const result = await service.submit(
      jane,
      [entry({ issueId: 1, notes: 'Shipped', newStatusId: 5 }), entry({ section: 'doing', issueId: 2, notes: 'Reviewing' })],
      { raw: 'state' }
    );

    expect(tracker.updates).toEqual([
      { apiKey: 'jane-key', issueId: 1, update: { notes: '[Daily Update - What I did]\nShipped', newStatusId: 5 } },
      { apiKey: 'jane-key', issueId: 2, update: { notes: '[Daily Update - What I am doing]\nReviewing', newStatusId: null } },
    ]);
    expect(result.failedIssueIds).toEqual([]);
    expect(result.reportText).toContain('<@UJANE>');
    const [stored] = store.recent(1, 'UJANE');
    expect(stored?.items.map((i) => [i.issueId, i.syncedToRedmine])).toEqual([[1, true], [2, true]]);
  });

  it('records a failed Redmine write and still writes the rest', async () => {
    tracker.failingIssueIds.add(1);
    const result = await service.submit(jane, [entry({ issueId: 1 }), entry({ issueId: 2 })], {});
    expect(result.failedIssueIds).toEqual([1]);
    expect(tracker.updates.map((u) => u.issueId)).toEqual([2]);
    const [stored] = store.recent(1, 'UJANE');
    expect(stored?.items.map((i) => [i.issueId, i.syncedToRedmine])).toEqual([[1, false], [2, true]]);
  });
});
