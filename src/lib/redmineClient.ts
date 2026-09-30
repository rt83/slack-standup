import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';

export interface IssueStatus {
  readonly id: number;
  readonly name: string;
}

/** Enough of an issue to name it, as the search endpoint returns it. */
export interface IssueSummary {
  readonly id: number;
  readonly subject: string;
}

export interface Issue extends IssueSummary {
  readonly status: IssueStatus;
  readonly projectName: string;
  /**
   * The statuses this user may move this issue to under its tracker's workflow, or null
   * when Redmine did not say (older Redmine, or no edit permission).
   */
  readonly allowedStatuses: readonly IssueStatus[] | null;
}

export interface IssueUpdate {
  /** Added to the issue as a journal comment. */
  readonly notes: string;
  readonly newStatusId: number | null;
}

/**
 * The issue tracker, as the standup flow uses it. Every call takes the person's own API
 * key, so what they read is what they can see and what they write is attributed to them.
 */
export interface IssueTracker {
  /** Open issues assigned to the key's owner, most recently updated first. */
  listAssignedOpenIssues(apiKey: string): Promise<Issue[]>;
  /** Issues matching a number or subject text, for the add-issue search box. */
  searchIssues(apiKey: string, query: string): Promise<IssueSummary[]>;
  getIssue(apiKey: string, issueId: number): Promise<Issue>;
  /** Every status Redmine defines, not filtered by workflow. */
  listStatuses(apiKey: string): Promise<readonly IssueStatus[]>;
  updateIssue(apiKey: string, issueId: number, update: IssueUpdate): Promise<void>;
}

const statusSchema = z.object({ id: z.number(), name: z.string() });

const issueSchema = z.object({
  id: z.number(),
  subject: z.string(),
  status: statusSchema,
  project: z.object({ name: z.string() }),
  allowed_statuses: z.array(statusSchema).optional(),
});

const issueResponseSchema = z.object({ issue: issueSchema });
const issueListResponseSchema = z.object({ issues: z.array(issueSchema) });
const statusListResponseSchema = z.object({ issue_statuses: z.array(statusSchema) });

const SEARCH_LIMIT = 15;
const ASSIGNED_LIMIT = 50;

/** IssueTracker over Redmine's REST API. */
export class RedmineClient implements IssueTracker {
  readonly #baseUrl: string;
  #statuses: Promise<readonly IssueStatus[]> | null = null;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl;
  }

  async listAssignedOpenIssues(apiKey: string): Promise<Issue[]> {
    const { data } = await this.#http(apiKey).get<unknown>('/issues.json', {
      params: { assigned_to_id: 'me', status_id: 'open', limit: ASSIGNED_LIMIT, sort: 'updated_on:desc' },
    });
    // The list endpoint leaves out `allowed_statuses`, so each issue is fetched on its own.
    const { issues } = issueListResponseSchema.parse(data);
    return Promise.all(issues.map((issue) => this.getIssue(apiKey, issue.id)));
  }

  async searchIssues(apiKey: string, query: string): Promise<IssueSummary[]> {
    const text = query.trim();
    const http = this.#http(apiKey);
    const results: IssueSummary[] = [];

    // Subject search never matches an issue number, so a bare number is looked up directly.
    if (/^\d+$/.test(text)) {
      try {
        results.push(await this.getIssue(apiKey, Number(text)));
      } catch {
        // Not found or not visible to this user; the subject search below still runs.
      }
    }

    const { data } = await http.get<unknown>('/issues.json', {
      params: { subject: `~${text}`, limit: SEARCH_LIMIT, status_id: '*' },
    });
    for (const issue of issueListResponseSchema.parse(data).issues) {
      if (!results.some((r) => r.id === issue.id)) results.push(toIssue(issue));
    }
    return results.slice(0, SEARCH_LIMIT);
  }

  async getIssue(apiKey: string, issueId: number): Promise<Issue> {
    const { data } = await this.#http(apiKey).get<unknown>(`/issues/${issueId}.json`, {
      params: { include: 'allowed_statuses' },
    });
    return toIssue(issueResponseSchema.parse(data).issue);
  }

  listStatuses(apiKey: string): Promise<readonly IssueStatus[]> {
    // Statuses are global in Redmine, so one fetch serves every user for the process's life.
    this.#statuses ??= this.#http(apiKey)
      .get<unknown>('/issue_statuses.json')
      .then(({ data }) => statusListResponseSchema.parse(data).issue_statuses)
      .catch((err: unknown) => {
        this.#statuses = null;
        throw err;
      });
    return this.#statuses;
  }

  async updateIssue(apiKey: string, issueId: number, update: IssueUpdate): Promise<void> {
    await this.#http(apiKey).put(`/issues/${issueId}.json`, {
      issue: {
        notes: update.notes,
        ...(update.newStatusId === null ? {} : { status_id: update.newStatusId }),
      },
    });
  }

  #http(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: this.#baseUrl,
      headers: { 'X-Redmine-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 10_000,
    });
  }
}

function toIssue(issue: z.infer<typeof issueSchema>): Issue {
  return {
    id: issue.id,
    subject: issue.subject,
    status: issue.status,
    projectName: issue.project.name,
    allowedStatuses: issue.allowed_statuses ?? null,
  };
}
