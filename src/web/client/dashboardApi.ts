import { DASHBOARD_API_PATH, dashboardDataSchema, dashboardErrorSchema, type DashboardData } from '../dashboardData.ts';

export type DashboardLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: DashboardData }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Fetches the dashboard data for the page's own query string (`?user=…&days=…`), which
 * the API reads the same way.
 */
export async function loadDashboard(search: string, fetcher: typeof fetch = fetch): Promise<DashboardLoad> {
  try {
    const response = await fetcher(`${DASHBOARD_API_PATH}${search}`, { headers: { accept: 'application/json' } });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = dashboardErrorSchema.safeParse(body);
      return { kind: 'failed', message: error.success ? error.data.error : `Request failed (${response.status}).` };
    }
    const data = dashboardDataSchema.safeParse(body);
    return data.success
      ? { kind: 'ready', data: data.data }
      : { kind: 'failed', message: 'The server sent data this page does not understand.' };
  } catch {
    return { kind: 'failed', message: 'Could not reach the server.' };
  }
}
