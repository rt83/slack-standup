import { describe, expect, it } from 'vitest';
import { loadDashboard } from './dashboardApi.ts';
import { sampleData } from './sampleData.ts';

const respond = (status: number, body: unknown): typeof fetch => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('loadDashboard', () => {
  it("asks the API with the page's own query string", async () => {
    let asked = '';
    await loadDashboard('?user=UJANE', async (input) => {
      asked = String(input);
      return new Response(JSON.stringify(sampleData));
    });
    expect(asked).toBe('/api/dashboard?user=UJANE');
  });

  it('returns the data when it matches the contract', async () => {
    expect(await loadDashboard('', respond(200, sampleData))).toEqual({ kind: 'ready', data: sampleData });
  });

  it("shows the server's own error message", async () => {
    expect(await loadDashboard('?user=X', respond(404, { error: 'No linked Redmine account for that Slack user.' }))).toEqual({
      kind: 'failed',
      message: 'No linked Redmine account for that Slack user.',
    });
  });

  it('refuses data that does not match the contract', async () => {
    const result = await loadDashboard('', respond(200, { ...sampleData, people: 'two' }));
    expect(result.kind).toBe('failed');
  });

  it('reports an unreachable server', async () => {
    const result = await loadDashboard('', async () => {
      throw new TypeError('fetch failed');
    });
    expect(result).toEqual({ kind: 'failed', message: 'Could not reach the server.' });
  });
});
