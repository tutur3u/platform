import { type EventProjection, projectRun } from './events';
import { boundedBody } from './security';

const MAX_EVENTS = 96;
const MAX_DELIVERIES = 256;
const RECONCILE_INTERVAL_MS = 60_000;

interface Snapshot {
  sha: string;
  observedAt: number;
  complete: boolean;
  runs: EventProjection[];
  etag?: string;
}

interface RepoState {
  events: EventProjection[];
  deliveries: string[];
  nextRead: number;
  ingress?: { window: number; accepted: number };
  snapshot?: Snapshot;
}

export interface DurableStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export type Operation =
  | { kind: 'stop' }
  | { kind: 'start' }
  | { kind: 'ingest'; repo: string; delivery: string; event: EventProjection }
  | { kind: 'status'; repo: string; sha: string }
  | { kind: 'pull'; repo: string; number: number };

function readJson(payload: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(payload)) as unknown;
}

async function reconcile(
  repo: string,
  sha: string,
  token: string,
  prior: Snapshot | undefined,
  now: () => number,
  upstream: typeof fetch
): Promise<Snapshot | undefined> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'tuturuuu-fleet-status',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (prior?.etag) headers['If-None-Match'] = prior.etag;
  const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`;
  try {
    const response = await upstream(url, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(4_000),
    });
    if (response.status === 304 && prior)
      return { ...prior, observedAt: now() };
    if (!response.ok) return undefined;
    const bytes = await boundedBody(response.body);
    if (!bytes) return undefined;
    const page = readJson(bytes) as {
      total_count?: unknown;
      workflow_runs?: unknown;
    };
    if (!Array.isArray(page?.workflow_runs) || page.workflow_runs.length > 100)
      return undefined;
    const runs = page.workflow_runs.flatMap((value) => {
      const run = projectRun(value);
      return run?.sha === sha ? [run] : [];
    });
    return {
      sha,
      runs,
      complete: page.total_count === runs.length,
      observedAt: now(),
      etag: response.headers.get('ETag') ?? undefined,
    };
  } catch {
    return undefined;
  }
}

export async function applyOperation(
  store: DurableStore,
  operation: Operation,
  deps: { githubToken?: string; now: () => number; upstream: typeof fetch }
) {
  if (operation.kind === 'start' || operation.kind === 'stop') {
    await store.put('enabled', operation.kind === 'start');
    return new Response(null, { status: 204 });
  }
  if ((await store.get<boolean>('enabled')) !== true)
    return new Response(null, { status: 503 });

  const key = `repo:${operation.repo}`;
  const state = (await store.get<RepoState>(key)) ?? {
    events: [],
    deliveries: [],
    nextRead: 0,
  };
  if (operation.kind === 'ingest') {
    const { delivery, event } = operation;
    if (state.deliveries.includes(delivery))
      return new Response(null, { status: 204 });
    const current = state.events.find((item) => item.key === event.key);
    if (current) {
      const currentAttempt = Number(current.data.run_attempt ?? 0);
      const nextAttempt = Number(event.data.run_attempt ?? 0);
      if (
        currentAttempt > nextAttempt ||
        (currentAttempt === nextAttempt &&
          (current.updated > event.updated ||
            (current.updated === event.updated &&
              (current.data.status === event.data.status ||
                current.data.status === 'completed'))))
      )
        return new Response(null, { status: 204 });
    }

    const window = Math.floor(deps.now() / 3_600_000);
    const accepted =
      state.ingress?.window === window ? state.ingress.accepted : 0;
    if (accepted >= 3600) return new Response(null, { status: 429 });
    state.ingress = { window, accepted: accepted + 1 };
    state.events = [
      event,
      ...state.events.filter((item) => item.key !== event.key),
    ].slice(0, MAX_EVENTS);
    state.deliveries = [delivery, ...state.deliveries].slice(0, MAX_DELIVERIES);
    await store.put(key, state);
    return new Response(null, { status: 204 });
  }
  if (operation.kind === 'pull') {
    const pull = state.events.find(
      (event) => event.key === `pull_request:${operation.number}`
    );
    return pull ? Response.json(pull) : new Response(null, { status: 404 });
  }
  const prior =
    state.snapshot?.sha === operation.sha ? state.snapshot : undefined;
  const now = deps.now();
  const webhook = state.events.filter((event) => event.sha === operation.sha);
  const hasRuns = webhook.some((event) => event.kind === 'workflow_run');
  const recentRun = webhook.some(
    (event) =>
      event.kind === 'workflow_run' && now - event.updated < 30 * 60_000
  );
  if (
    !recentRun &&
    deps.githubToken &&
    now >= state.nextRead &&
    (!prior || now - prior.observedAt >= RECONCILE_INTERVAL_MS)
  ) {
    // Reserve before I/O. An ambiguous fetch or a restart consumes the slot.
    state.nextRead = now + RECONCILE_INTERVAL_MS;
    await store.put(key, state);
    const snapshot = await reconcile(
      operation.repo,
      operation.sha,
      deps.githubToken,
      prior,
      deps.now,
      deps.upstream
    );
    if (snapshot) {
      state.snapshot = snapshot;
      await store.put(key, state);
    }
  }
  const snapshot =
    state.snapshot?.sha === operation.sha ? state.snapshot : undefined;
  const runs = new Map(snapshot?.runs.map((event) => [event.key, event]));
  for (const event of webhook) {
    if (event.kind !== 'workflow_run') continue;
    if ((runs.get(event.key)?.updated ?? -1) <= event.updated)
      runs.set(event.key, event);
  }
  const observedAt = snapshot?.observedAt ?? null;
  const complete =
    snapshot?.complete &&
    deps.now() - snapshot.observedAt < RECONCILE_INTERVAL_MS;
  return Response.json({
    source: snapshot ? 'github' : 'webhook',
    coverage: complete
      ? 'complete'
      : hasRuns || snapshot
        ? 'partial'
        : 'unknown',
    observedAt,
    runs: [...runs.values()].map((event) => event.data),
    related: webhook.filter((event) => event.kind !== 'workflow_run'),
  });
}
