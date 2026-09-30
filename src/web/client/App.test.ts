// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '../dashboardData.ts';
import App from './App.vue';
import { sampleData } from './sampleData.ts';

// Chart.js needs a real canvas; the charts' own rendering is not what these tests check.
const stubs = { TrendChart: true, OriginChart: true };

function serve(status: number, body: unknown): void {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }));
}

async function mountApp() {
  const wrapper = mount(App, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dashboard page', () => {
  it('shows the team stats, who is missing, and the log', async () => {
    serve(200, sampleData);
    const wrapper = await mountApp();

    expect(wrapper.findAll('[data-test="stat-value"]').map((s) => s.text())).toEqual(['1/2', '1', '25%', '1']);
    expect(wrapper.text()).toContain('Missing today');
    expect(wrapper.text()).toContain('Bob');
    expect(wrapper.text()).toContain('Jane');
    expect(wrapper.text()).toContain('Sep 29, 2:05 AM');
    expect(wrapper.text()).toContain('redmine sync failed');
    expect(wrapper.findComponent({ name: 'OriginChart' }).exists()).toBe(false);
  });

  it('shows notes as text, never as markup', async () => {
    serve(200, sampleData);
    const wrapper = await mountApp();
    const notes = wrapper.get('[data-test="notes"]');
    expect(notes.text()).toBe('<b>not bold</b>');
    expect(notes.find('b').exists()).toBe(false);
  });

  it("shows a person's composition chart instead of the missing list", async () => {
    const person: DashboardData = {
      ...sampleData,
      focus: { kind: 'person', person: { slackUserId: 'UJANE', displayName: 'Jane' } },
    };
    serve(200, person);
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain('Issue composition');
    expect(wrapper.text()).not.toContain('Missing today');
    expect(wrapper.find('header').text()).toContain('Jane');
    expect(document.title).toBe('Daily Log — Jane');
  });

  it('shows why the data could not be loaded', async () => {
    serve(404, { error: 'No linked Redmine account for that Slack user.' });
    const wrapper = await mountApp();
    expect(wrapper.get('[role="alert"]').text()).toBe('No linked Redmine account for that Slack user.');
  });
});
