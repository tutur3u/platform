import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import {
  getLocalInternalAppUrl,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from '@tuturuuu/utils/internal-domains';
import { isCalendarStagingArtifact } from './deployment-profile';

const PRODUCTION_ROOT = 'tuturuuu.com'; // host-scan-allow

function isProductionHost(hostname: string) {
  return (
    hostname === PRODUCTION_ROOT || hostname.endsWith(`.${PRODUCTION_ROOT}`)
  );
}

function explicitTasksUrl() {
  return resolveInternalAppUrl({
    appName: 'tasks',
    candidates: [
      process.env.TASKS_APP_URL,
      process.env.NEXT_PUBLIC_TASKS_APP_URL,
    ],
    fallback: '',
  });
}

/**
 * Origin of the Tasks API owner, or `null` when none may be used.
 *
 * Staging has no fallback: it needs an explicit Tasks URL and never accepts a
 * production host, so staging session cookies cannot reach production Tasks.
 * Production and local development derive the origin from the build-time
 * deployment profile (`CALENDAR_DEPLOYMENT_PROFILE`).
 */
export function resolveCalendarTasksOrigin(): string | null {
  if (isCalendarStagingArtifact()) {
    const configured = explicitTasksUrl();
    if (!configured) return null;
    try {
      const url = new URL(configured);
      if (url.protocol !== 'https:' || isProductionHost(url.hostname))
        return null;
      return url.origin;
    } catch {
      return null;
    }
  }
  const origin = resolveInternalAppUrl({
    appName: 'tasks',
    candidates: [
      process.env.TASKS_APP_URL,
      process.env.NEXT_PUBLIC_TASKS_APP_URL,
    ],
    fallback:
      process.env.CALENDAR_DEPLOYMENT_PROFILE === 'production'
        ? (PRODUCTION_INTERNAL_APP_DOMAINS.find(({ name }) => name === 'tasks')
            ?.url ?? '')
        : getLocalInternalAppUrl('tasks', 'http://localhost:7809'),
  });
  return origin || null;
}
