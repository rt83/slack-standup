import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '../lib/calendar.ts';
import { openDatabase } from '../lib/db.ts';
import { SubmissionStore } from '../lib/submissionStore.ts';
import { UserStore } from '../lib/userStore.ts';
import { DashboardService } from './dashboard.ts';
import { registerDashboardRoutes } from './server.ts';

describe('dashboard routes', () => {
  let clientDir: string;
  let server: Server;
  let base: string;

  const start = async (): Promise<void> => {
    const db = openDatabase(':memory:');
    const users = new UserStore(db);
    users.link({ slackUserId: 'UJANE', redmineUserId: 1, redmineApiKey: 'jane-secret-key', displayName: 'Jane' });
    const dashboard = new DashboardService(users, new SubmissionStore(db, new Calendar('UTC')), 'UTC');

    const router = express.Router();
    registerDashboardRoutes(router, dashboard, clientDir);
    server = express().use(router).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  beforeEach(() => {
    clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-client-'));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(clientDir, { recursive: true, force: true });
  });

  it('serves the built page for any scope, and its assets', async () => {
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<div id="app"></div>');
    fs.mkdirSync(path.join(clientDir, 'assets'));
    fs.writeFileSync(path.join(clientDir, 'assets', 'index-abc.js'), 'console.log(1)');
    await start();

    const page = await fetch(`${base}/dashboard?user=UJANE`);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('<div id="app"></div>');
    const asset = await fetch(`${base}/dashboard/assets/index-abc.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
  });

  it('says how to fix a missing client build instead of failing blankly', async () => {
    await start();
    const page = await fetch(`${base}/dashboard`);
    expect(page.status).toBe(503);
    expect(await page.text()).toContain('npm run build');
  });

  it('answers the API with JSON for a linked person, and 404 for anyone else', async () => {
    await start();
    const ok = await fetch(`${base}/api/dashboard?user=UJANE`);
    expect(ok.status).toBe(200);
    const body = await ok.text();
    expect(JSON.parse(body).focus.person.displayName).toBe('Jane');
    expect(body).not.toContain('secret-key');

    const missing = await fetch(`${base}/api/dashboard?user=UNOBODY`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'No linked Redmine account for that Slack user.' });
  });
});
