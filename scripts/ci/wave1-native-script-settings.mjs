import { setTimeout as delay } from 'node:timers/promises';

const POLL_INTERVAL_MS = 5_000;
const SETTINGS_TIMEOUT_MS = 60_000;

/**
 * A post-activation settings incident. The version check has already passed,
 * so the message states that the new version serves 100% of traffic and that
 * settings drift is resolved separately, never by another upload or rollback.
 */
export class ScriptObservabilityError extends Error {
  constructor(worker, detail) {
    super(
      `${worker} script-settings check ${detail}. The new version is confirmed active at 100%.` +
        ' Treat any settings mismatch as a separate settings incident.' +
        ' Resolve it with a release-authority-ACKed settings PATCH and keep the active version in place.'
    );
    this.name = 'ScriptObservabilityError';
  }
}

/**
 * A failed read is described by its HTTP status or error class only: the job
 * log is public, so provider bodies and request paths are never printed.
 */
function describeReadFailure(error) {
  const status = /\((\d{3})\)/u.exec(
    typeof error?.message === 'string' ? error.message : ''
  );
  if (status) return `read failed with HTTP ${status[1]}`;
  return `read failed (${error?.name === 'AbortError' || error?.name === 'TimeoutError' ? 'request timeout' : 'request error'})`;
}

function describeObservability(actual) {
  const enabled = actual?.enabled;
  const rate = actual?.head_sampling_rate;
  // Only known scalar fields can appear in the public job log.
  return actual == null
    ? 'observability is missing or null'
    : `enabled=${typeof enabled === 'boolean' ? enabled : 'missing or invalid'}, head_sampling_rate=${Number.isFinite(rate) ? rate : 'missing or invalid'}`;
}

/**
 * GET-only check: polls every five seconds for at most 60 seconds. A non-OK
 * or failed read counts as an attempt and is retried inside the same bound.
 */
export async function waitForScriptObservability({
  worker,
  expected,
  readSettings,
  signal,
  timing: {
    now = () => performance.now(),
    sleep = (ms, signal) => delay(ms, undefined, { signal }),
  } = {},
}) {
  const budget = AbortSignal.timeout(SETTINGS_TIMEOUT_MS);
  const pollSignal = signal ? AbortSignal.any([signal, budget]) : budget;
  const deadline = now() + SETTINGS_TIMEOUT_MS;
  let attempts = 0;
  let lastObserved = 'no read completed';

  while (now() < deadline && !pollSignal.aborted) {
    attempts++;
    try {
      const response = await readSettings(pollSignal);
      if (response?.success === true) {
        const actual = response.result?.observability;
        lastObserved = describeObservability(actual);
        if (
          actual?.enabled === expected.enabled &&
          actual?.head_sampling_rate === expected.head_sampling_rate
        )
          return;
      } else lastObserved = 'read returned success=false';
    } catch (error) {
      if (pollSignal.aborted) break;
      lastObserved = describeReadFailure(error);
    }
    // Stop when no further poll could start inside the bound.
    if (deadline - now() <= POLL_INTERVAL_MS || pollSignal.aborted) break;
    try {
      await sleep(POLL_INTERVAL_MS, pollSignal);
    } catch (error) {
      if (pollSignal.aborted) break;
      throw error;
    }
  }

  throw new ScriptObservabilityError(
    worker,
    `timed out after ${attempts} attempts ` +
      `(expected enabled=${expected.enabled}, head_sampling_rate=${expected.head_sampling_rate}; last observed ${lastObserved})`
  );
}
