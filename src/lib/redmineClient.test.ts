import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedmineClient } from './redmineClient.ts';

interface SeenRequest {
  method: string;
  url: URL;
  apiKey: string | undefined;
  body: unknown;
}

const issue = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  subject: `Issue ${id}`,
  status: { id: 1, name: 'New' },
  project: { id: 9, name: 'Paginary' },
  ...extra,
});

/** A stand-in Redmine: records every request and answers from `routes`. */
describe('RedmineClient', () => {
  const seen: SeenRequest[] = [];
  let routes: Record<string, (url: URL) => [number, unknown]> = {};
  let server: http.Server;
  let client: RedmineClient;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://redmine.test');
        const raw = Buffer.concat(chunks).toString();
        seen.push({
          method: req.method ?? '',
          url,
          apiKey: req.headers['x-redmine-api-key']?.toString(),
          body: raw ? JSON.parse(raw) : undefined,
        });
        const route = routes[`${req.method} ${url.pathname}`];
        const [status, body] = route ? route(url) : [404, {}];
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    client = new RedmineClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  beforeEach(() => {
    seen.length = 0;
    routes = {};
  });

  it("asks for an issue's workflow-legal statuses and maps them", async () => {
    routes['GET /issues/7.json'] = () => [200, { issue: issue(7, { allowed_statuses: [{ id: 2, name: 'In Progress' }] }) }];
    const result = await client.getIssue('key-a', 7);
    expect(seen[0]?.url.searchParams.get('include')).toBe('allowed_statuses');
    expect(seen[0]?.apiKey).toBe('key-a');
    expect(result).toEqual({
      id: 7,
      subject: 'Issue 7',
      status: { id: 1, name: 'New' },
      projectName: 'Paginary',
      allowedStatuses: [{ id: 2, name: 'In Progress' }],
    });
  });

  it('reports unknown allowed statuses as null, not as none', async () => {
    routes['GET /issues/7.json'] = () => [200, { issue: issue(7) }];
    expect((await client.getIssue('k', 7)).allowedStatuses).toBeNull();
  });

  it('rejects a response that is not the shape Redmine documents', async () => {
    routes['GET /issues/7.json'] = () => [200, { issue: { id: 7 } }];
    await expect(client.getIssue('k', 7)).rejects.toThrow();
  });

  it('hydrates each assigned open issue with its own fetch', async () => {
    routes['GET /issues.json'] = () => [200, { issues: [issue(1), issue(2)] }];
    routes['GET /issues/1.json'] = () => [200, { issue: issue(1) }];
    routes['GET /issues/2.json'] = () => [200, { issue: issue(2) }];
    const result = await client.listAssignedOpenIssues('k');
    expect(result.map((i) => i.id)).toEqual([1, 2]);
    const list = seen.find((r) => r.url.pathname === '/issues.json');
    expect(list?.url.searchParams.get('assigned_to_id')).toBe('me');
    expect(list?.url.searchParams.get('status_id')).toBe('open');
  });

  it('looks a bare number up directly, then by subject, without duplicates', async () => {
    routes['GET /issues/42.json'] = () => [200, { issue: issue(42) }];
    routes['GET /issues.json'] = () => [200, { issues: [issue(42), issue(420)] }];
    const result = await client.searchIssues('k', ' 42 ');
    expect(result).toEqual([
      { id: 42, subject: 'Issue 42', status: { id: 1, name: 'New' }, projectName: 'Paginary', allowedStatuses: null },
      { id: 420, subject: 'Issue 420', status: { id: 1, name: 'New' }, projectName: 'Paginary', allowedStatuses: null },
    ]);
    expect(seen.find((r) => r.url.pathname === '/issues.json')?.url.searchParams.get('subject')).toBe('~42');
  });

  it('still searches by subject when the number is not visible', async () => {
    routes['GET /issues.json'] = () => [200, { issues: [issue(5)] }];
    expect((await client.searchIssues('k', '99')).map((i) => i.id)).toEqual([5]);
  });

  it('fetches the global status list once, and again after a failure', async () => {
    let calls = 0;
    routes['GET /issue_statuses.json'] = () => (++calls === 1 ? [500, {}] : [200, { issue_statuses: [{ id: 1, name: 'New' }] }]);
    await expect(client.listStatuses('k')).rejects.toThrow();
    expect(await client.listStatuses('k')).toEqual([{ id: 1, name: 'New' }]);
    expect(await client.listStatuses('other-key')).toEqual([{ id: 1, name: 'New' }]);
    expect(calls).toBe(2);
  });

  it('writes the note, and a status only when one was picked', async () => {
    routes['PUT /issues/3.json'] = () => [204, {}];
    await client.updateIssue('k', 3, { notes: 'done', newStatusId: 5 });
    await client.updateIssue('k', 3, { notes: 'still going', newStatusId: null });
    expect(seen.map((r) => r.body)).toEqual([
      { issue: { notes: 'done', status_id: 5 } },
      { issue: { notes: 'still going' } },
    ]);
  });
});
