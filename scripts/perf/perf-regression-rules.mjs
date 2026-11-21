// Pure regression rules for the Performance Factory detector. No I/O here so
// the same rules run against live Cloudflare windows and recorded fixtures.
//
// Latency: a window breaches when its p95 TTFB is more than 25% OR more than
// 150 ms over baseline, so the trigger is min(1.25 * baseline, baseline + 150).
// A latency regression needs two consecutive breaching windows, matching the
// gateway rollout watch's noise-resistant rule. Error rate: any single-window jump counts.

export const DEFAULT_RULES = Object.freeze({
  latencyRatio: 1.25,
  latencyAbsoluteMs: 150,
  consecutiveWindows: 2,
  minRequestsPerWindow: 50,
  // An error-rate jump needs real errors, a doubled rate, and a meaningful
  // absolute increase, so one stray 5xx on a quiet app does not page anyone.
  errorMinCount: 5,
  errorRatio: 2,
  errorAbsoluteRate: 0.005,
  // With no usable baseline the rate is an unknown, so only a near-outage
  // (this share of a busy window failing) fires; modest chronic rates do not.
  noBaselineErrorRate: 0.5,
});

export function median(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function latencyTrigger(baselineMs, rules = DEFAULT_RULES) {
  if (!Number.isFinite(baselineMs)) return null;
  return Math.min(
    baselineMs * rules.latencyRatio,
    baselineMs + rules.latencyAbsoluteMs
  );
}

export function errorRate(window) {
  return window.requests > 0 ? window.errors / window.requests : 0;
}

function usable(window, rules) {
  return (
    window.requests >= rules.minRequestsPerWindow &&
    Number.isFinite(window.p95Ms)
  );
}

/**
 * Baseline from windows that ended before the evaluation range. The median of
 * per-window p95 values resists a single slow window; error rate is pooled.
 */
export function computeBaseline(windows, rules = DEFAULT_RULES) {
  const good = windows.filter((window) => usable(window, rules));
  const requests = good.reduce((sum, window) => sum + window.requests, 0);
  const errors = good.reduce((sum, window) => sum + window.errors, 0);
  return {
    windows: good.length,
    p95Ms: median(good.map((window) => window.p95Ms)),
    errorRate: requests > 0 ? errors / requests : 0,
    requests,
  };
}

export function isErrorJump(window, baselineRate, rules = DEFAULT_RULES) {
  const rate = errorRate(window);
  return (
    window.errors >= rules.errorMinCount &&
    rate >= baselineRate * rules.errorRatio &&
    rate - baselineRate >= rules.errorAbsoluteRate
  );
}

/**
 * Evaluate windows (oldest first) against a baseline. Returns zero, one or two
 * findings: the first qualifying latency run and the first error-rate jump.
 */
export function evaluateWindows(windows, baseline, rules = DEFAULT_RULES) {
  const findings = [];
  const trigger = latencyTrigger(baseline.p95Ms, rules);
  if (trigger !== null) {
    let run = [];
    for (const window of windows) {
      if (usable(window, rules) && window.p95Ms > trigger) {
        run.push(window);
        if (run.length >= rules.consecutiveWindows) break;
      } else {
        run = [];
      }
    }
    if (run.length >= rules.consecutiveWindows) {
      findings.push({
        metric: 'p95_ttfb_ms',
        startTime: run[0].start,
        baseline: round(baseline.p95Ms),
        trigger: round(trigger),
        observed: run.map((window) => round(window.p95Ms)),
        windows: run.map(({ start, end }) => ({ start, end })),
      });
    }
  }
  // With no usable baseline window the baseline rate is an unknown, not zero:
  // treating it as 0% turns any chronic error rate into a "jump". Detection is
  // not disabled though: a busy window that is mostly failing (an outage) still
  // fires on the absolute floor, so new or low-traffic apps are not blind.
  const noBaseline = baseline.windows === 0;
  const jump = windows.find(
    (window) =>
      window.requests >= rules.minRequestsPerWindow &&
      (noBaseline
        ? window.errors >= rules.errorMinCount &&
          errorRate(window) >= rules.noBaselineErrorRate
        : isErrorJump(window, baseline.errorRate, rules))
  );
  if (jump) {
    findings.push({
      metric: 'error_rate',
      startTime: jump.start,
      baseline: round(baseline.errorRate, 5),
      trigger: round(
        noBaseline
          ? rules.noBaselineErrorRate
          : Math.max(
              baseline.errorRate * rules.errorRatio,
              baseline.errorRate + rules.errorAbsoluteRate
            ),
        5
      ),
      observed: [round(errorRate(jump), 5)],
      windows: [{ start: jump.start, end: jump.end }],
    });
  }
  return findings;
}

/**
 * Deploys that could explain a regression: anything that became active in
 * [startTime - lookback, startTime + one window]. Newest first.
 */
export function suspectDeploys(deploys, startTime, options = {}) {
  const lookbackMs = (options.lookbackMinutes ?? 120) * 60_000;
  const graceMs = (options.windowMinutes ?? 15) * 60_000;
  const start = Date.parse(startTime);
  return deploys
    .filter((deploy) => {
      const at = Date.parse(deploy.createdAt);
      return at >= start - lookbackMs && at <= start + graceMs;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Tag each window with the version that was active when it started. */
export function activeVersionAt(deploys, time) {
  const at = Date.parse(time);
  let active = null;
  for (const deploy of [...deploys].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  )) {
    if (Date.parse(deploy.createdAt) <= at) active = deploy;
  }
  return active;
}

/** Median p95 and pooled error rate per active version across all windows. */
export function versionSummary(windows, deploys) {
  const groups = new Map();
  for (const window of windows) {
    const deploy = activeVersionAt(deploys, window.start);
    const key = deploy?.versionId ?? 'unknown';
    const group = groups.get(key) ?? {
      versionId: key,
      sha: deploy?.sha ?? null,
      windows: [],
    };
    group.windows.push(window);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const requests = group.windows.reduce((sum, w) => sum + w.requests, 0);
    const errors = group.windows.reduce((sum, w) => sum + w.errors, 0);
    return {
      versionId: group.versionId,
      sha: group.sha,
      windows: group.windows.length,
      p95Ms: round(median(group.windows.map((w) => w.p95Ms))),
      errorRate: round(requests > 0 ? errors / requests : 0, 5),
    };
  });
}

export function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
