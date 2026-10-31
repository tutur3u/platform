/**
 * Server-side ingest for app-switch beacons (see `app-switch-rum`).
 *
 * Analytics Engine writes are billable and the endpoint is anonymous, so a
 * write needs every gate to pass, and any failure drops the beacon:
 *
 * 1. The operator fence variable is exactly `on`.
 * 2. A dataset is bound.
 * 3. The body is at most {@link APP_SWITCH_MAX_BODY_BYTES} bytes, read as a
 *    bounded stream with a deadline.
 * 4. The isolate's local budget has room. This is a cheap pre-filter that
 *    limits calls to the durable admission.
 * 5. The durable admission, shared by every instance, has room and is not
 *    stopped. Missing, unstarted or failing admission storage admits nothing.
 *
 * Over-budget beacons are dropped, never queued, so a restart or a resumed
 * admission never replays a backlog. Failed writes are not retried.
 *
 * Portable: no framework or runtime imports.
 */
import {
  type AnalyticsEngineWriter,
  APP_SWITCH_MAX_BODY_BYTES,
  appSwitchDataPoint,
  parseAppSwitchSample,
} from './app-switch-rum';

/** Worker variable holding the operator fence for beacon ingest. */
export const APP_SWITCH_RUM_INGEST_ENV = 'APP_SWITCH_RUM_INGEST';
/** Default per-isolate pre-filter: data points per window. */
export const APP_SWITCH_ISOLATE_LIMIT = 30;
export const APP_SWITCH_WINDOW_MS = 60_000;
/** How long a beacon body may take to arrive. */
export const APP_SWITCH_READ_TIMEOUT_MS = 1_000;

/**
 * Operator fence. Only the literal `on` lets beacons reach admission; a
 * missing, empty or unknown value keeps ingest stopped without reading the
 * body. The value is part of the deployed Worker version, so it survives
 * isolate restarts and changes without a rebuild.
 */
export function isAppSwitchIngestEnabled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'on';
}

export interface AppSwitchWriteBudget {
  /** Take one write from the current window; `false` means drop. */
  tryTake(nowMs: number): boolean;
}

/** Fixed-window budget for one isolate. */
export function createAppSwitchWriteBudget(
  limit = APP_SWITCH_ISOLATE_LIMIT,
  windowMs = APP_SWITCH_WINDOW_MS
): AppSwitchWriteBudget {
  let windowStart = Number.NEGATIVE_INFINITY;
  let used = 0;
  return {
    tryTake(nowMs) {
      if (nowMs - windowStart >= windowMs) {
        windowStart = nowMs;
        used = 0;
      }
      if (used >= limit) return false;
      used += 1;
      return true;
    },
  };
}

export interface AppSwitchAdmissionState {
  stopped: boolean;
  windowStart: number;
  used: number;
}

/**
 * Durable state shared by every instance. `update` must apply `next` atomically
 * against the current value, as a Durable Object does by serialising its
 * requests. An absent state means admission was never started.
 */
export interface AppSwitchAdmissionStore {
  update<T>(
    next: (state: AppSwitchAdmissionState | undefined) => {
      state: AppSwitchAdmissionState | undefined;
      result: T;
    }
  ): Promise<T>;
}

export interface AppSwitchAdmission {
  /** Whether one more write fits; never throws, and `false` on any failure. */
  admit(nowMs: number): Promise<boolean>;
}

/** Global fixed-window budget with a durable operator stop. */
export function createAppSwitchAdmission(
  store: AppSwitchAdmissionStore,
  limit: number,
  windowMs = APP_SWITCH_WINDOW_MS
): AppSwitchAdmission {
  return {
    async admit(nowMs) {
      try {
        return await store.update((state) => {
          if (!state || state.stopped) return { state, result: false };
          const current =
            nowMs - state.windowStart >= windowMs
              ? { stopped: false, windowStart: nowMs, used: 0 }
              : state;
          if (current.used >= limit) return { state: current, result: false };
          return {
            state: { ...current, used: current.used + 1 },
            result: true,
          };
        });
      } catch {
        return false;
      }
    },
  };
}

/** Operator control: start (`false`) or stop (`true`) durable admission. */
export function setAppSwitchAdmissionStopped(
  store: AppSwitchAdmissionStore,
  stopped: boolean
): Promise<void> {
  return store.update((state) => ({
    state: {
      stopped,
      windowStart: state?.windowStart ?? 0,
      used: state?.used ?? 0,
    },
    result: undefined,
  }));
}

export type BoundedText =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 408 | 413 };

/**
 * Read at most `maxBytes` of UTF-8 within `timeoutMs`. Overflow and timeouts
 * cancel the stream instead of draining it.
 */
export async function readBoundedText(
  request: Request,
  maxBytes: number,
  timeoutMs: number
): Promise<BoundedText> {
  const declared = request.headers.get('content-length');
  if (declared !== null && !(Number(declared) <= maxBytes))
    return { ok: false, status: 413 };
  if (!request.body) return { ok: true, text: '' };
  const reader = request.body.getReader();
  const stop = () => void reader.cancel().catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next === 'timeout') {
        stop();
        return { ok: false, status: 408 };
      }
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        stop();
        return { ok: false, status: 413 };
      }
      chunks.push(next.value);
    }
  } catch {
    stop();
    return { ok: false, status: 400 };
  } finally {
    clearTimeout(timer);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
        bytes
      ),
    };
  } catch {
    return { ok: false, status: 400 };
  }
}

export interface AppSwitchIngestOptions {
  /** Raw {@link APP_SWITCH_RUM_INGEST_ENV} value. */
  ingest: unknown;
  /** The isolate's pre-filter; create it once at module scope. */
  budget: AppSwitchWriteBudget;
  /** Durable shared admission. Without it nothing is written. */
  admission?: AppSwitchAdmission;
  country?: string;
  now?: () => number;
  readTimeoutMs?: number;
}

const accepted = () =>
  new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });

/** Turn one beacon into at most one data point; see the module gates. */
export async function handleAppSwitchBeacon(
  request: Request,
  dataset: AnalyticsEngineWriter | undefined,
  options: AppSwitchIngestOptions
): Promise<Response> {
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const { admission } = options;
  if (!dataset || !admission || !isAppSwitchIngestEnabled(options.ingest))
    return accepted();
  const body = await readBoundedText(
    request,
    APP_SWITCH_MAX_BODY_BYTES,
    options.readTimeoutMs ?? APP_SWITCH_READ_TIMEOUT_MS
  );
  if (!body.ok) return new Response(null, { status: body.status });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const sample = parseAppSwitchSample(parsed);
  if (!sample) return new Response(null, { status: 400 });
  const nowMs = (options.now ?? Date.now)();
  if (!options.budget.tryTake(nowMs)) return accepted();
  if (!(await admission.admit(nowMs))) return accepted();
  try {
    dataset.writeDataPoint(appSwitchDataPoint(sample, options.country));
  } catch {
    // Metrics are best effort: drop rather than retry.
  }
  return accepted();
}
