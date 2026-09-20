const CALENDAR_JOBS = new Set([
  '/api/cron/calendar/provider-sync',
  '/api/cron/calendar/smart-schedule',
]);

// Routes are fixed so a job definition cannot exfiltrate server credentials.
function resolveCronRequest(path, env) {
  if (!/^\/api\/cron\/[a-zA-Z0-9/_-]+$/.test(path)) {
    throw new Error('Invalid cron route.');
  }
  const headers = {
    Authorization: `Bearer ${env.CRON_SECRET || env.VERCEL_CRON_SECRET}`,
  };
  if (CALENDAR_JOBS.has(path)) {
    const secret = env.CALENDAR_CRON_GATEWAY_SECRET;
    if (!secret || !/^[a-zA-Z0-9_-]{43,}$/.test(secret)) {
      throw new Error('Calendar cron gateway credential is not configured.');
    }
    headers['x-tuturuuu-calendar-gateway'] = secret;
    return { url: new URL(path, 'https://calendar.tuturuuu.com'), headers };
  }
  return {
    url: new URL(path, env.INTERNAL_WEB_API_ORIGIN || 'http://web-proxy:7803'),
    headers,
  };
}

module.exports = { resolveCronRequest };
