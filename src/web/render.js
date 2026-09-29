/**
 * Renders the dashboard as a single self-contained HTML page.
 *
 * Design brief (see /mnt/skills/public/frontend-design for the process this
 * follows): this is a daily engineering log, not a generic SaaS metrics
 * page — so the visual language borrows from a ledger/logbook rather than
 * a card-and-shadow dashboard kit. Plex Sans carries headings/body, Plex
 * Mono carries anything that's actually data (issue IDs, timestamps,
 * counts) — a functional distinction, not decoration. Row numbers in the
 * submissions table are legitimate here because it IS a sequential log.
 */

const COLORS = {
  bg: '#EEF1F4',
  panel: '#FFFFFF',
  ink: '#1B2430',
  inkMuted: '#5B6675',
  rule: 'rgba(27,36,48,0.12)',
  teal: '#1C7C8C',
  amber: '#C97C2A',
  green: '#3F7D52',
  rust: '#B14A3A',
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function statPip(label, value, tone = 'ink') {
  return `
    <div class="stat">
      <div class="stat-value stat-${tone}">${escapeHtml(value)}</div>
      <div class="stat-label">${escapeHtml(label)}</div>
    </div>`;
}

function submissionRow(submission, index) {
  const time = new Date(submission.submitted_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const itemLine = (item) => {
    const tag = item.is_manual
      ? '<span class="tag tag-manual">added</span>'
      : '<span class="tag tag-auto">assigned</span>';
    const status = item.new_status_id
      ? `<span class="mono item-status">→ status ${escapeHtml(item.new_status_id)}</span>`
      : '';
    const synced = item.redmine_synced
      ? ''
      : '<span class="tag tag-error">redmine sync failed</span>';
    return `
      <li class="item ${item.is_manual ? 'item-manual' : ''}">
        <span class="mono item-issue">#${escapeHtml(item.issue_id)}</span>
        <span class="item-section">${item.section === 'did' ? 'did' : 'doing'}</span>
        ${tag}${status}${synced}
        <div class="item-notes">${escapeHtml(item.notes)}</div>
      </li>`;
  };

  const did = submission.items.filter((i) => i.section === 'did');
  const doing = submission.items.filter((i) => i.section === 'doing');

  return `
    <details class="row">
      <summary>
        <span class="mono row-index">${String(index + 1).padStart(3, '0')}</span>
        <span class="row-user">${escapeHtml(submission.display_name || submission.slack_user_id)}</span>
        <span class="mono row-time">${escapeHtml(time)}</span>
        <span class="row-count">${submission.items.length} issue${submission.items.length === 1 ? '' : 's'}</span>
      </summary>
      <div class="row-body">
        ${did.length ? `<div class="row-section"><h4>What I did</h4><ul>${did.map(itemLine).join('')}</ul></div>` : ''}
        ${doing.length ? `<div class="row-section"><h4>What I'm doing</h4><ul>${doing.map(itemLine).join('')}</ul></div>` : ''}
      </div>
    </details>`;
}

function buildDashboardHtml({
  scopeLabel,          // "All updates" or "Jane Doe"
  kpis,                // { submittedToday, totalPeople, missingToday, manualPct }
  dailyCounts,         // [{day, count}]
  manualVsAuto,        // {manual, auto}
  submissions,         // getSubmissionsWithItems() result, with display_name joined in
  missingToday,        // [{displayName, slackUserId}]
}) {
  const dayLabels = JSON.stringify(dailyCounts.map((d) => d.day.slice(5))); // MM-DD
  const dayValues = JSON.stringify(dailyCounts.map((d) => d.count));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daily Log — ${escapeHtml(scopeLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"></script>
<style>
  :root {
    --bg: ${COLORS.bg}; --panel: ${COLORS.panel}; --ink: ${COLORS.ink};
    --ink-muted: ${COLORS.inkMuted}; --rule: ${COLORS.rule};
    --teal: ${COLORS.teal}; --amber: ${COLORS.amber}; --green: ${COLORS.green}; --rust: ${COLORS.rust};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: 'IBM Plex Sans', sans-serif; line-height: 1.5;
  }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 40px 24px 80px; }

  header.page { border-bottom: 1px solid var(--rule); padding-bottom: 20px; margin-bottom: 28px;
    display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
  header.page h1 { font-size: 22px; font-weight: 600; margin: 0; }
  header.page .scope { color: var(--ink-muted); font-size: 14px; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
    border: 1px solid var(--rule); margin-bottom: 28px; }
  .stat { padding: 18px 20px; border-right: 1px solid var(--rule); }
  .stat:last-child { border-right: none; }
  .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 26px; font-weight: 500; }
  .stat-label { color: var(--ink-muted); font-size: 12.5px; margin-top: 4px; }
  .stat-teal { color: var(--teal); } .stat-amber { color: var(--amber); }
  .stat-green { color: var(--green); } .stat-rust { color: var(--rust); }

  .panels { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 32px; }
  .panel { border: 1px solid var(--rule); background: var(--panel); padding: 20px; }
  .panel h3 { margin: 0 0 14px; font-size: 13px; font-weight: 600; color: var(--ink-muted); }

  .missing-list { list-style: none; margin: 0; padding: 0; }
  .missing-list li { padding: 6px 0; border-bottom: 1px solid var(--rule); font-size: 14px;
    display: flex; justify-content: space-between; }
  .missing-list li:last-child { border-bottom: none; }
  .missing-list .badge { color: var(--rust); font-size: 12px; }
  .all-caught-up { color: var(--green); font-size: 14px; }

  table.log-head { width: 100%; }
  .log { border: 1px solid var(--rule); background: var(--panel); }
  .row { border-bottom: 1px solid var(--rule); }
  .row:last-child { border-bottom: none; }
  .row summary { list-style: none; cursor: pointer; padding: 12px 20px;
    display: grid; grid-template-columns: 40px 1fr 150px 90px; align-items: center; gap: 12px; font-size: 14px; }
  .row summary::-webkit-details-marker { display: none; }
  .row summary:hover { background: rgba(28,124,140,0.05); }
  .row-index { color: var(--ink-muted); font-size: 12px; }
  .row-user { font-weight: 500; }
  .row-time { color: var(--ink-muted); font-size: 12.5px; }
  .row-count { color: var(--ink-muted); font-size: 12.5px; text-align: right; }
  .row-body { padding: 4px 20px 18px 72px; }
  .row-section h4 { font-size: 12px; text-transform: none; color: var(--ink-muted);
    margin: 10px 0 6px; font-weight: 600; }
  .row-section ul { list-style: none; margin: 0; padding: 0; }
  .item { padding: 8px 0; border-top: 1px solid var(--rule); font-size: 13.5px; }
  .item:first-child { border-top: none; }
  .item-manual { border-left: 2px solid var(--amber); padding-left: 10px; margin-left: -12px; }
  .item-issue { color: var(--teal); margin-right: 8px; }
  .item-section { color: var(--ink-muted); font-size: 11.5px; margin-right: 8px; }
  .item-notes { margin-top: 4px; color: var(--ink); }
  .item-status { color: var(--ink-muted); margin-left: 6px; font-size: 12px; }
  .tag { font-size: 10.5px; padding: 1px 6px; border: 1px solid var(--rule); margin-right: 6px; color: var(--ink-muted); }
  .tag-manual { border-color: var(--amber); color: var(--amber); }
  .tag-auto { border-color: var(--rule); }
  .tag-error { border-color: var(--rust); color: var(--rust); }

  .empty { padding: 40px 20px; text-align: center; color: var(--ink-muted); }

  @media (max-width: 720px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .stat:nth-child(2) { border-right: none; }
    .panels { grid-template-columns: 1fr; }
    .row summary { grid-template-columns: 30px 1fr; grid-template-areas: "idx user" "idx time"; }
    .row-count { display: none; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <h1>Daily Log</h1>
    <div class="scope">${escapeHtml(scopeLabel)}</div>
  </header>

  <div class="stats">
    ${statPip('submitted today', `${kpis.submittedToday}/${kpis.totalPeople}`, kpis.missingToday > 0 ? 'amber' : 'green')}
    ${statPip('missing today', kpis.missingToday, kpis.missingToday > 0 ? 'rust' : 'green')}
    ${statPip('manually added', `${kpis.manualPct}%`, 'teal')}
    ${statPip('logged, last ' + dailyCounts.length + 'd', dailyCounts.reduce((a, d) => a + d.count, 0))}
  </div>

  <div class="panels">
    <div class="panel">
      <h3>Submissions, last ${dailyCounts.length} days</h3>
      <canvas id="trendChart" height="90"></canvas>
    </div>
    <div class="panel">
      <h3>${missingToday ? 'Missing today' : 'Issue composition'}</h3>
      ${
        missingToday
          ? missingToday.length
            ? `<ul class="missing-list">${missingToday.map((u) => `<li>${escapeHtml(u.displayName || u.slackUserId)}<span class="badge">not submitted</span></li>`).join('')}</ul>`
            : `<div class="all-caught-up">Everyone's submitted today.</div>`
          : `<canvas id="compChart" height="140"></canvas>`
      }
    </div>
  </div>

  <div class="log">
    ${
      submissions.length
        ? submissions.map((s, i) => submissionRow(s, i)).join('')
        : `<div class="empty">No submissions yet.</div>`
    }
  </div>
</div>

<script>
  const trendCtx = document.getElementById('trendChart');
  if (trendCtx) {
    new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: ${dayLabels},
        datasets: [{
          data: ${dayValues},
          borderColor: '${COLORS.teal}',
          backgroundColor: 'rgba(28,124,140,0.08)',
          fill: true, tension: 0.25, pointRadius: 2,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, color: '${COLORS.inkMuted}' }, grid: { color: '${COLORS.rule}' } },
          x: { ticks: { color: '${COLORS.inkMuted}' }, grid: { display: false } },
        },
      },
    });
  }

  const compCtx = document.getElementById('compChart');
  if (compCtx) {
    new Chart(compCtx, {
      type: 'doughnut',
      data: {
        labels: ['Assigned', 'Manually added'],
        datasets: [{
          data: [${manualVsAuto.auto}, ${manualVsAuto.manual}],
          backgroundColor: ['${COLORS.teal}', '${COLORS.amber}'],
          borderWidth: 0,
        }],
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { color: '${COLORS.inkMuted}', boxWidth: 12 } } },
      },
    });
  }
</script>
</body>
</html>`;
}

module.exports = { buildDashboardHtml };
