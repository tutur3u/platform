// Production auto-publish reconciler (Cron Control job
// `production-auto-publish-reconcile`). Every constant here bounds one run;
// see apps/docs/build/devops/production-auto-publish-reconciler.mdx.

export const RECONCILE_JOB = 'production-auto-publish-reconcile';

/** The repository whose fence variables and production ref are read. */
export const RECONCILE_REPOSITORY = 'tutur3u/platform';

/**
 * The Workers that publish automatically from the `production` ref, with the
 * public build-info endpoint the publisher itself checks (the first origin of
 * each app in scripts/ci/serving-workers-apps.mjs). A Worker joins this list
 * in the change that makes it an automatic publication member.
 */
export const RECONCILE_WORKERS: readonly {
  buildInfo: string;
  script: string;
}[] = Object.freeze([
  {
    script: 'tuturuuu-roadmap',
    buildInfo: 'https://tuturuuu.com/roadmap/api/build-info',
  },
  {
    script: 'tuturuuu-learn',
    buildInfo: 'https://learn.tuturuuu.com/api/build-info',
  },
  {
    script: 'tuturuuu-teach',
    buildInfo: 'https://teach.tuturuuu.com/api/build-info',
  },
  {
    script: 'tuturuuu-nova',
    buildInfo: 'https://tuturuuu.com/nova/api/build-info',
  },
  {
    script: 'tuturuuu-tools',
    buildInfo: 'https://tools.tuturuuu.com/api/build-info',
  },
  {
    script: 'tuturuuu-lms',
    buildInfo: 'https://tuturuuu.com/lms/api/build-info',
  },
]);

/** Hard ceilings for one run. */
export const MAX_WORKERS = 16;
/** GitHub lists at most 30 repository variables per page. */
export const VARIABLES_PER_PAGE = 30;
export const MAX_VARIABLE_PAGES = 5;
/**
 * Provider reads per run: variable pages, the production ref, then one
 * deployments read and one build-info read per Worker.
 */
export const PROVIDER_REQUEST_BUDGET = MAX_VARIABLE_PAGES + 1 + 2 * MAX_WORKERS;
/** At most one operator alert RPC per run. */
export const MAX_ALERTS_PER_RUN = 1;
/** Wall-time cap for one run, inside the Cron Control lease deadline. */
export const RUN_WALL_MS = 60_000;
/** Findings carried in one alert's data; the counts always cover all. */
export const MAX_ALERT_FINDINGS = 16;

/** Fence variable names the reconciler inspects. */
export const FENCE_VARIABLE = /^PRODUCTION_AUTO_PUBLISH(?:_[A-Z0-9_]{1,64})?$/u;

export interface ReconcileWindows {
  /** A `stopped` fence older than this (by its last update) is stale. */
  stopWindowMs: number;
  /** A split or 0% staged deployment older than this is leftover. */
  splitTtlMs: number;
  /** A Worker off the production SHA this long after the ref moved lags. */
  lagWindowMs: number;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** A strict positive integer within [min, max], else the default. */
function bounded(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const text = raw?.trim() ?? '';
  if (!/^[1-9][0-9]{0,5}$/u.test(text)) return fallback;
  const value = Number(text);
  return value >= min && value <= max ? value : fallback;
}

export interface ReconcileWindowEnv {
  AUTO_PUBLISH_RECONCILE_LAG_WINDOW_MINUTES?: string;
  AUTO_PUBLISH_RECONCILE_SPLIT_TTL_MINUTES?: string;
  AUTO_PUBLISH_RECONCILE_STOP_WINDOW_HOURS?: string;
}

/** Windows from optional text overrides; malformed values keep defaults. */
export function reconcileWindows(env: ReconcileWindowEnv): ReconcileWindows {
  return {
    stopWindowMs:
      bounded(env.AUTO_PUBLISH_RECONCILE_STOP_WINDOW_HOURS, 24, 1, 720) * HOUR,
    splitTtlMs:
      bounded(env.AUTO_PUBLISH_RECONCILE_SPLIT_TTL_MINUTES, 120, 30, 10_080) *
      MINUTE,
    lagWindowMs:
      bounded(env.AUTO_PUBLISH_RECONCILE_LAG_WINDOW_MINUTES, 120, 30, 10_080) *
      MINUTE,
  };
}
