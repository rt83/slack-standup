import type { Issue, IssueTracker } from '../lib/redmineClient.ts';
import type { SubmissionStore } from '../lib/submissionStore.ts';
import type { LinkedUser } from '../lib/userStore.ts';
import { formatIssueNote, formatReport } from './report.ts';
import { NO_ADDED_ISSUES, type AddedIssueIds, type StandupFormContent, type StandupFormState } from './standupForm.ts';
import { SECTIONS, type Section, type StandupEntry } from './types.ts';

/** The part of the submission store that recording an update needs. */
export type SubmissionRecorder = Pick<SubmissionStore, 'record' | 'recordSync'>;

export interface SubmitResult {
  readonly reportText: string;
  /** Issue ids whose Redmine write failed; the rest were written. */
  readonly failedIssueIds: readonly number[];
}

/** Fills the standup form from Redmine and turns a submitted form into Redmine writes. */
export class StandupService {
  readonly #tracker: IssueTracker;
  readonly #submissions: SubmissionRecorder;

  constructor(tracker: IssueTracker, submissions: SubmissionRecorder) {
    this.#tracker = tracker;
    this.#submissions = submissions;
  }

  openForm(user: LinkedUser): Promise<StandupFormContent> {
    return this.#load(user, NO_ADDED_ISSUES, []);
  }

  /** The form re-rendered with one more issue in `section`, keeping what was typed. */
  addIssue(user: LinkedUser, state: StandupFormState, section: Section, issueId: number): Promise<StandupFormContent> {
    const current = state.added[section];
    const added: AddedIssueIds = {
      ...state.added,
      [section]: current.includes(issueId) ? current : [...current, issueId],
    };
    return this.#load(user, added, state.entries);
  }

  /**
   * Records the update, then writes each entry to its Redmine issue as a comment (and a
   * status change, if one was picked). Never reassigns an issue. A failed write is
   * recorded against its item and does not stop the others.
   */
  async submit(user: LinkedUser, entries: readonly StandupEntry[], auditPayload: unknown): Promise<SubmitResult> {
    const reportText = formatReport(user.slackUserId, entries);
    const { items } = this.#submissions.record({
      slackUserId: user.slackUserId,
      auditPayload,
      reportText,
      entries,
    });

    const failedIssueIds: number[] = [];
    await Promise.all(
      items.map(async ({ itemId, entry }) => {
        try {
          await this.#tracker.updateIssue(user.redmineApiKey, entry.issueId, {
            notes: formatIssueNote(entry),
            newStatusId: entry.newStatusId,
          });
          this.#submissions.recordSync(itemId, { ok: true });
        } catch (err) {
          failedIssueIds.push(entry.issueId);
          this.#submissions.recordSync(itemId, { ok: false, error: errorMessage(err) });
        }
      })
    );
    return { reportText, failedIssueIds };
  }

  async #load(user: LinkedUser, addedIds: AddedIssueIds, draft: readonly StandupEntry[]): Promise<StandupFormContent> {
    const [assigned, fallbackStatuses] = await Promise.all([
      this.#tracker.listAssignedOpenIssues(user.redmineApiKey),
      this.#tracker.listStatuses(user.redmineApiKey),
    ]);

    // An issue already on the list is not added a second time: its blocks would collide.
    const assignedIds = new Set(assigned.map((i) => i.id));
    const toFetch = [...new Set(SECTIONS.flatMap((s) => addedIds[s]))].filter((id) => !assignedIds.has(id));
    const fetched = new Map<number, Issue>(
      (await Promise.all(toFetch.map((id) => this.#tracker.getIssue(user.redmineApiKey, id)))).map((i) => [i.id, i])
    );
    const addedIn = (section: Section): Issue[] =>
      addedIds[section].flatMap((id) => fetched.get(id) ?? []);

    return {
      assigned,
      added: { did: addedIn('did'), doing: addedIn('doing') },
      fallbackStatuses,
      draft,
    };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
