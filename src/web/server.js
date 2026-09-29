const {
  listUsers,
  getUserBySlackId,
  getSubmissionsWithItems,
  getDailySubmissionCounts,
  getManualVsAutoCounts,
  getTodaySubmissionStatus,
} = require('../lib/db');
const { buildDashboardHtml } = require('./render');

/**
 * Joins display_name onto raw submission rows for rendering, since
 * submissions only stores slack_user_id.
 */
function withDisplayNames(submissions) {
  const users = listUsers();
  const nameByUser = new Map(users.map((u) => [u.slack_user_id, u.display_name]));
  return submissions.map((s) => ({ ...s, display_name: nameByUser.get(s.slack_user_id) }));
}

/**
 * Registers GET /dashboard on the given Express router (shared with the
 * Bolt app's own ExpressReceiver so the whole thing runs on one port).
 *
 * Query params:
 *   ?user=<slackUserId>  — scope everything to one person
 *   ?days=<n>             — trend window, defaults to 14
 */
function registerDashboardRoutes(router) {
  router.get('/dashboard', (req, res) => {
    const slackUserId = req.query.user || null;
    const days = Math.min(Number(req.query.days) || 14, 90);

    let scopeLabel = 'All updates';
    let missingToday = null; // only populated for the all-people view

    if (slackUserId) {
      const user = getUserBySlackId(slackUserId);
      if (!user) {
        res.status(404).send('No linked Redmine account for that Slack user.');
        return;
      }
      scopeLabel = user.display_name || slackUserId;
    }

    const submissions = withDisplayNames(getSubmissionsWithItems({ slackUserId, limit: 50 }));
    const dailyCounts = getDailySubmissionCounts({ slackUserId, days });
    const manualVsAuto = getManualVsAutoCounts({ slackUserId });

    const totalPeople = listUsers().length;
    let submittedToday;
    if (slackUserId) {
      submittedToday = submissions.some(
        (s) => new Date(s.submitted_at).toDateString() === new Date().toDateString()
      )
        ? 1
        : 0;
    } else {
      const statuses = getTodaySubmissionStatus();
      submittedToday = statuses.filter((s) => s.submittedToday).length;
      missingToday = statuses.filter((s) => !s.submittedToday);
    }

    const totalItems = manualVsAuto.manual + manualVsAuto.auto;
    const manualPct = totalItems ? Math.round((manualVsAuto.manual / totalItems) * 100) : 0;

    const html = buildDashboardHtml({
      scopeLabel,
      kpis: {
        submittedToday,
        totalPeople: slackUserId ? 1 : totalPeople,
        missingToday: slackUserId ? 0 : (missingToday || []).length,
        manualPct,
      },
      dailyCounts,
      manualVsAuto,
      submissions,
      missingToday,
    });

    res.set('Content-Type', 'text/html').send(html);
  });
}

module.exports = { registerDashboardRoutes };
