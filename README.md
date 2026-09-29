# Redmine Standup Bot

A Slack app for daily standups. Each developer reports "What I did" and "What I am doing".
The form is pre-filled with their open Redmine issues. They can add more issues and change an
issue's status. On submit, every entry is written to its Redmine issue as a comment.

## How it works

1. A developer runs `/update`, or clicks **Submit Daily Update** on the app's Home tab.
2. The bot looks up their Redmine API key and fetches their open issues.
3. A modal opens with two sections, "What I did" and "What I am doing". Both are filled with
   those issues.
4. The search box adds more issues by number or title. Added issues are marked 🆕 and listed
   under "Manually added". Block Kit has no text colour, so emoji and grouping stand in for it.
5. Each issue row has a notes field and a status dropdown. The dropdown lists the statuses this
   developer may move the issue to under its tracker's workflow. Redmine returns them as
   `allowed_statuses`. When Redmine returns none, the full status list is offered instead.
6. Adding an issue re-renders the modal. Notes already typed and statuses already picked are
   kept.
7. On submit, each entry becomes a `PUT /issues/{id}.json`. The notes become a journal comment.
   A picked status becomes a status change. Issues are never reassigned.
8. The report is posted to `SLACK_UPDATES_CHANNEL` and stored in SQLite.

Writes use the developer's own API key. Redmine attributes each comment to them, not to a bot.

### "Today"

`TZ` sets the team's time zone. Every "today" in the app is a day in that zone: the reminder,
the dashboard's "submitted today", and the per-day chart. Timestamps are stored in UTC.

## Dashboard

`/dashboard` replies with a button that opens the web dashboard in the person's browser. A bot
cannot open a browser itself, so the button is a link.

- `/dashboard` opens the team view. It shows the submission trend, who has not submitted today,
  and a log of every submission. Expand a row to see its items.
- `/dashboard --p @jane` opens the same page scoped to Jane. It shows how many of her issues
  were assigned and how many she added by hand. The value must be an `@mention`. Slack sends a
  mention as `<@U0123ABC|jane>`. A plain `--p jane` does not name a user and is refused.

The dashboard is a Vue 3 app styled with Tailwind CSS 4. Vite builds it into `dist/dashboard`.
The app server serves that build at `GET /dashboard` and its data at `GET /api/dashboard`. Both
share the port Slack's requests arrive on. Set `PUBLIC_URL` to the address your team's browsers
reach that server at.

**The dashboard has no authentication.** Anyone with the URL can view it. Anyone who guesses a
`?user=` Slack ID can view that person's page. Before sharing it outside a trusted network, put
it behind your SSO or reverse-proxy auth.

## Documentation

- [Installation guide](docs/guides/installation.html): the Slack app manifest, Redmine setup,
  configuration, HTTPS, running as a service, backups and troubleshooting.
- [User guide](docs/guides/user-guide.html): submitting an update, the dashboard, and linking
  people to Redmine.

The guides are HTML. Open them in a browser, from disk or from any static host.

## Quick start

Requires Node.js 22.18 or later. Node runs the TypeScript sources directly, so the server has
no build step. Only the dashboard client is built.

```bash
npm install
cp -r conf-sample conf   # then fill in conf/app.env
npm run build            # builds the dashboard client
npm start
```

The app reads `conf/app.env` from the folder it is started in. `conf-sample/` is the committed
template. `conf/` holds secrets, and git ignores it. A variable set in the real environment
overrides the same name in the file.

### Development

```bash
npm run dev          # the app server, restarting on change
npm run dev:client   # the dashboard with hot reload at http://localhost:5173/dashboard/
npm test             # all tests, server and client
npm run typecheck    # tsc for the server, vue-tsc for the client
```

`dev:client` proxies `/api` to the app server on the `PORT` in `conf/app.env`, so run both.

## Project structure

```
src/
  app.ts                    # composition root: builds everything and wires it together
  config.ts                 # reads conf/app.env and validates every setting, once
  lib/
    calendar.ts             # what "today" is, in the team's time zone
    db.ts                   # opens SQLite and applies the schema
    userStore.ts            # Slack-to-Redmine account links
    submissionStore.ts      # submissions, their items, and the per-day queries
    redmineClient.ts        # IssueTracker interface and its Redmine REST implementation
  standup/
    types.ts                # sections, issue origins, a form entry
    standupForm.ts          # the modal's Block Kit: builds it and reads it back
    standupService.ts       # fills the form from Redmine; turns a submission into Redmine writes
    report.ts               # the channel report and the Redmine comment text
    reminderJob.ts          # DMs whoever has not submitted today
  slack/
    standupHandlers.ts      # /update, Home tab, issue search, add issue, submit
    dashboardCommand.ts     # /dashboard
    linkRedmineCommand.ts   # /link-redmine
    mentions.ts             # reads a user id from an escaped @mention
    slackMessenger.ts       # sends DMs for the reminder
  web/
    dashboardData.ts        # the API contract, as a zod schema shared by server and client
    dashboard.ts            # assembles the dashboard data
    server.ts               # GET /dashboard, GET /api/dashboard, and the link Slack posts
    client/                 # the Vue app
```

Tests sit next to the code they cover, as `*.test.ts`.

```
conf-sample/app.env         # configuration template, committed
conf/app.env                # your configuration, ignored by git
docs/guides/                # installation and user guides (HTML)
```

## Known gaps

- **Dashboard auth:** there is none. See the warning above.
- **`/link-redmine` has no admin check.** See the warning above.
- **API keys are stored in plain text** in the `users` table.
- **Two comments per issue per day.** Both sections start with the same issues, and notes are
  required. Every open issue therefore gets a "What I did" and a "What I am doing" comment on
  every submit.
- **Large issue lists break the modal.** Each issue uses 4 blocks in each section, plus 4 blocks
  for the headers and search boxes. Slack allows 100 blocks per modal. Someone with 13 or more
  open issues cannot open the form.
- **Status IDs, not names.** The channel report and the dashboard show `status → 5`, not the
  status name.
- **Dashboard scale:** the log shows the latest 50 submissions, with no paging.
