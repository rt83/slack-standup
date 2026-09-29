# Redmine Standup Bot

Slack app that collects daily "What I did / What I am doing" reports,
pre-filled with each developer's in-progress Redmine issues, lets them
add extra issues (autocomplete) or change issue status inline, and writes
the whole thing back to Redmine as journal comments.

## How it works

1. Developer runs `/update` or clicks **Submit Daily Update** on the app's
   Home tab.
2. The bot looks up their Redmine API key (from the `users` table), pulls
   their open/in-progress issues, and opens a modal with two sections
   ("What I did" / "What I am doing"), each pre-filled with those issues.
3. They can add more issues via an autocomplete (`external_select`) box —
   these are visually marked 🆕 and grouped under "Manually added" (Block
   Kit has no arbitrary text color, so this is emoji + grouping, not literal
   color).
4. Each issue row has a notes field and a status dropdown scoped to that
   issue's actual Redmine workflow — it uses `allowed_statuses` from
   Redmine's own issue-show response (the legal transitions for that
   tracker + the user's role), falling back to the full status list only
   if Redmine doesn't return that field.
5. On submit: every touched issue gets a `PUT /issues/{id}.json` in Redmine
   with the notes as a journal comment and the new status if one was picked.
   No reassignment ever happens, regardless of how the issue got onto the
   list. The formatted report is also posted to `SLACK_UPDATES_CHANNEL` and
   logged locally for history/search.

## Dashboard

`/dashboard` posts a link button to a real web page (no more modal) —
Slack can't literally "open a browser" from the bot side, so the pattern
is: bot replies with a button whose `url` opens in the person's own
browser.

- `/dashboard` → team-wide view: submission trend, issue composition
  (assigned vs. manually added), who hasn't submitted today, and a
  chronological log of every submission (expand a row to see the actual
  did/doing items).
- `/dashboard --p @jane` → the same page scoped to Jane only. The `--p`
  value must be an `@mention` (Slack sends it as `<@U0123ABC|jane>` in the
  command text) — plain `--p jane` won't resolve to a user.

The dashboard is served by the same Express server Slack's Events API
uses (`ExpressReceiver`), at `GET /dashboard` — set `PUBLIC_URL` in `.env`
to wherever that server is actually reachable from your team's browsers.

**No auth on the dashboard route yet.** Anyone with the URL (or who
guesses a `?user=` Slack ID) can view it. Before sharing outside a trusted
network, put it behind your normal SSO/reverse-proxy auth, or add a
signed, short-lived token to the link Slack posts.

## Setup

```bash
npm install
cp .env.example .env   # fill in Slack + Redmine credentials
npm start
```

### Slack app configuration (api.slack.com/apps)

- **Slash Commands:** `/update`, `/dashboard`, `/link-redmine`
- **Interactivity & Shortcuts:** enable, point Request URL at
  `https://<your-host>/slack/events`
- **Event Subscriptions:** subscribe to `app_home_opened`
- **OAuth Scopes (bot):** `commands`, `chat:write`, `im:write`, `users:read`
- **App Home:** enable Home Tab

### Linking developers to Redmine

Each developer needs a personal Redmine API key (Redmine → My account →
API access key) so comments/status changes are attributed to them, not a
shared bot account. An admin runs, once per person:

```
/link-redmine @jane 42 abcdef0123456789...
```

This is a placeholder command — lock it down with an admin allowlist
before using in a real workspace (see comment in `src/app.js`).

## Project structure

```
src/
  app.js                    # entrypoint, slash commands, cron reminder
  lib/
    db.js                   # sqlite: user mapping + submission history
    redmineClient.js        # Redmine REST API wrapper
  blocks/
    modalBuilder.js         # Block Kit modal construction
  handlers/
    openModal.js            # opens the pre-filled modal
    optionsLoad.js          # autocomplete for "+ Add issue"
    addIssueAction.js       # rebuilds modal when an issue is added
    viewSubmission.js       # parses submission, writes to Redmine, posts report
  web/
    server.js               # GET /dashboard route, queries + assembles data
    render.js                # dashboard HTML template (Chart.js trend + composition charts)
```

## Known gaps / next steps

- **Dashboard auth:** see the warning above — there isn't any yet.
- **Dashboard scale:** the log queries the last 50 submissions per page
  load with no pagination UI; fine for a small team, add a "load more" /
  date-range picker before this gets used by a large org.
- **Partial state preservation:** `views.update` replaces the whole modal.
  `addIssueAction.js` re-injects notes text so adding an issue doesn't wipe
  what's already typed, but a selected (not-yet-submitted) status dropdown
  value isn't re-injected yet — same technique, just needs `initial_option`
  wired up from `currentValues`.
- **Timezone-aware "submitted today":** `hasSubmittedToday` checks UTC date;
  fine for one-timezone teams, needs adjusting if your team spans zones.
- **Admin lock on `/link-redmine`:** no auth check yet — add a Slack user ID
  allowlist before deploying.
- **Redmine status ID literalism:** the report posted to Slack currently
  shows `status → 5` (raw ID) rather than the status name — worth mapping
  back through `getIssueStatuses` before formatting.
