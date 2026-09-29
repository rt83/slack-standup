import fs from 'node:fs';
import path from 'node:path';
import type { ExpressReceiver } from '@slack/bolt';
import express from 'express';
import { DEFAULT_TREND_DAYS, MAX_TREND_DAYS, type DashboardScope, type DashboardService } from './dashboard.ts';
import { DASHBOARD_API_PATH, DASHBOARD_PAGE_PATH, DAYS_PARAM, USER_PARAM } from './dashboardData.ts';

/** The dashboard link for `scope`. The only place its URL shape is built. */
export function dashboardUrl(publicUrl: string, scope: DashboardScope): string {
  const url = new URL(DASHBOARD_PAGE_PATH, `${publicUrl}/`);
  if (scope.kind === 'person') url.searchParams.set(USER_PARAM, scope.slackUserId);
  return url.toString();
}

/** Reads the scope and trend window from a request's query string. */
export function readDashboardQuery(query: Readonly<Record<string, unknown>>): { scope: DashboardScope; days: number } {
  const user = query[USER_PARAM];
  const scope: DashboardScope =
    typeof user === 'string' && user ? { kind: 'person', slackUserId: user } : { kind: 'team' };
  const days = Math.min(Math.max(Math.trunc(Number(query[DAYS_PARAM])) || DEFAULT_TREND_DAYS, 1), MAX_TREND_DAYS);
  return { scope, days };
}

/**
 * Serves the dashboard on the router Bolt already serves Slack requests from, so the
 * whole app runs on one port: the JSON API, and the built Vue client from `clientDir`
 * (the output of `npm run build`).
 */
export function registerDashboardRoutes(
  router: ExpressReceiver['router'],
  dashboard: DashboardService,
  clientDir: string
): void {
  router.get(DASHBOARD_API_PATH, (req, res) => {
    const { scope, days } = readDashboardQuery(req.query);
    const data = dashboard.build(scope, days);
    if (!data) {
      res.status(404).json({ error: 'No linked Redmine account for that Slack user.' });
      return;
    }
    res.json(data);
  });

  const indexHtml = path.join(clientDir, 'index.html');
  router.use(`${DASHBOARD_PAGE_PATH}/assets`, express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }));
  router.get(DASHBOARD_PAGE_PATH, (_req, res) => {
    if (!fs.existsSync(indexHtml)) {
      res.status(503).type('text').send('Dashboard client is not built. Run `npm run build`.');
      return;
    }
    res.sendFile(indexHtml);
  });
}
