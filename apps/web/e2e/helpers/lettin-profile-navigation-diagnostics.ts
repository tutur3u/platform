import type { Frame, Page, Request, Response } from '@playwright/test';

const workspaceProfile =
  /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/profile\/?$/iu;
export function profileNavigationRoute(
  value: string,
  origin: string | undefined
) {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(origin ?? '').origin) return 'external';
    const pathname = url.pathname.replace(/^\/(?:en|vi)(?=\/)/u, '');
    if (workspaceProfile.test(pathname)) return 'profile';
    if (pathname === '/login') return 'login';
    if (pathname === '/verify-token') return 'verify-token';
    if (pathname === '/dashboard') return 'dashboard';
    return 'other-local';
  } catch {
    return 'unparseable';
  }
}
function navigationLocale(
  value: string | undefined,
  origin: string | undefined
) {
  if (value === undefined) return 'unavailable';
  try {
    const url = new URL(value);
    if (url.origin !== new URL(origin ?? '').origin) return 'external';
    return url.pathname.match(/^\/(en|vi)(?=\/)/u)?.[1] ?? 'unprefixed';
  } catch {
    return 'unparseable';
  }
}
export function profileNavigationEdge(
  source: string,
  destination: string | undefined,
  origin: string | undefined
) {
  let samePath: boolean | null = null;
  let sameOrigin: boolean | null = null;
  try {
    if (destination !== undefined) {
      const from = new URL(source);
      const to = new URL(destination);
      sameOrigin = from.origin === to.origin;
      samePath = sameOrigin && from.pathname === to.pathname;
    }
  } catch {
    /* Invalid destinations remain unknown. */
  }
  return {
    route: profileNavigationRoute(source, origin),
    locale: navigationLocale(source, origin),
    targetRoute:
      destination === undefined
        ? 'unavailable'
        : profileNavigationRoute(destination, origin),
    targetLocale: navigationLocale(destination, origin),
    samePath,
    sameOrigin,
  };
}
export function profileProxyProvenance(value: string | undefined) {
  const match = value?.match(
    /^(canonical-locale|canonical-public|verify-token|login|auth-login|workspace-route-status|intl)\|(en|vi|unprefixed)\|(en|vi|unprefixed)\|(same|different)$/u
  );
  if (!match) return {};
  return {
    proxy: {
      stage: match[1],
      requestLocale: match[2],
      nextLocale: match[3],
      sameRequestPath: match[4] === 'same',
    },
  };
}
function responseProxyProvenance(response: Response) {
  try {
    return profileProxyProvenance(
      response.headers?.()['x-lettin-profile-proxy']
    );
  } catch {
    return {};
  }
}
type Route = ReturnType<typeof profileNavigationRoute>;
type Origin = 'local' | 'external' | 'unparseable' | 'unavailable';
type RequestObservation = Record<
  'start' | 'response' | 'finish' | 'fail',
  number | null
> & {
  id: number;
  frame: number | null;
  route: Route;
  origin: Origin;
  resource: string;
  method: string;
  navigation: boolean | null;
  status: number | null;
  terminal: 'outstanding-at-snapshot' | 'finished' | 'failed' | 'unknown';
};
type FrameObservation = Record<
  'initial' | 'attached' | 'navigated' | 'detached',
  number | null
> & {
  id: number;
  parent: number | null;
  main: boolean | null;
  route: Route;
  origin: Origin;
  load: 'unknown';
};
const resources = new Set(
  'document stylesheet image media font script texttrack xhr fetch eventsource websocket manifest'.split(
    ' '
  )
);
const methods = new Set('GET HEAD POST PUT PATCH DELETE OPTIONS'.split(' '));
export async function observeProfileNavigation<T>(
  page: Page,
  origin: string | undefined,
  navigate: () => Promise<T>
): Promise<T> {
  const requests = new Map<Request, RequestObservation>();
  const frames = new Map<Frame, FrameObservation>();
  const events: {
    kind: string;
    request: number | null;
    frame: number | null;
    at: number | null;
  }[] = [];
  const counts = {
    starts: 0,
    responses: 0,
    finishes: 0,
    failures: 0,
    frameEvents: 0,
    orphan: 0,
    droppedRequests: 0,
    droppedFrames: 0,
    droppedEvents: 0,
    errors: 0,
    timingErrors: 0,
  };
  let saturated = false;
  let closed = false;
  let epoch: number | undefined;
  const bump = (key: keyof typeof counts) => {
    if (counts[key] < 65535) counts[key]++;
    else saturated = true;
  };
  const safe = (action: () => void) => {
    if (closed) return;
    try {
      action();
    } catch {
      bump('errors');
    }
  };
  const read = <V>(action: () => V, fallback: V): V => {
    try {
      return action();
    } catch {
      bump('errors');
      return fallback;
    }
  };
  const now = () => {
    const current = read(() => performance.now(), Number.NaN);
    epoch ??= current;
    const elapsed = Math.round(current - epoch);
    if (
      Number.isFinite(current) &&
      Number.isInteger(elapsed) &&
      elapsed >= 0 &&
      elapsed <= 2147483647
    )
      return elapsed;
    bump('timingErrors');
    return null;
  };
  now();
  const classify = (value: string): { route: Route; origin: Origin } => {
    const route = profileNavigationRoute(value, origin);
    return {
      route,
      origin:
        route === 'unparseable'
          ? 'unparseable'
          : route === 'external'
            ? 'external'
            : 'local',
    };
  };
  const addEvent = (
    kind: string,
    request: number | null,
    frame: number | null
  ) => {
    if (events.length < 128) events.push({ kind, request, frame, at: now() });
    else bump('droppedEvents');
  };
  const location = (url: () => string) =>
    read<ReturnType<typeof classify>>(() => classify(url()), {
      route: 'unparseable',
      origin: 'unavailable',
    });
  const frameRecord = (frame: Frame): FrameObservation | undefined => {
    const prior = frames.get(frame);
    if (prior) return prior;
    if (frames.size === 16) {
      bump('droppedFrames');
      return;
    }
    const parent = read(() => frame.parentFrame(), null);
    const item: FrameObservation = {
      id: frames.size + 1,
      parent: parent ? (frames.get(parent)?.id ?? null) : null,
      main: read<boolean | null>(() => frame === page.mainFrame(), null),
      ...location(() => frame.url()),
      initial: null,
      attached: null,
      navigated: null,
      detached: null,
      load: 'unknown',
    };
    frames.set(frame, item);
    return item;
  };
  const onFrame = (
    frame: Frame,
    kind: 'initial' | 'attached' | 'navigated' | 'detached'
  ) =>
    safe(() => {
      bump('frameEvents');
      const item = frameRecord(frame);
      if (item) {
        item[kind] = now();
        safe(() => {
          Object.assign(item, classify(frame.url()));
        });
      }
      addEvent(kind, null, item?.id ?? null);
    });
  const onRequest = (request: Request) =>
    safe(() => {
      bump('starts');
      if (requests.has(request)) {
        bump('errors');
        return;
      }
      if (requests.size === 64) {
        bump('droppedRequests');
        return;
      }
      const resource = read(() => request.resourceType(), 'other');
      const method = read(() => request.method(), 'other');
      const item: RequestObservation = {
        id: requests.size + 1,
        frame: read(() => frameRecord(request.frame())?.id ?? null, null),
        ...location(() => request.url()),
        resource: resources.has(resource) ? resource : 'other',
        method: methods.has(method) ? method : 'other',
        navigation: read<boolean | null>(
          () => request.isNavigationRequest(),
          null
        ),
        start: now(),
        response: null,
        finish: null,
        fail: null,
        status: null,
        terminal: 'outstanding-at-snapshot',
      };
      requests.set(request, item);
      addEvent('start', item.id, item.frame);
    });
  const terminal = (request: Request, kind: 'finished' | 'failed') =>
    safe(() => {
      bump(kind === 'finished' ? 'finishes' : 'failures');
      const item = requests.get(request);
      if (item) {
        if (item.terminal !== 'outstanding-at-snapshot') bump('errors');
        else {
          item.terminal = kind;
          item[kind === 'finished' ? 'finish' : 'fail'] = now();
        }
      } else bump('orphan');
      addEvent(kind, item?.id ?? null, item?.frame ?? null);
    });
  const responses: {
    item: Response;
    status: number;
    body: 'pending' | 'finished' | 'failed' | 'unavailable';
  }[] = [];
  let domContentLoaded = false;
  let load = false;
  let truncated = false;
  const response = (item: Response) =>
    safe(() => {
      bump('responses');
      const request = item.request();
      const status = item.status();
      const valid = Number.isInteger(status) && status >= 100 && status <= 599;
      const tracked = requests.get(request);
      if (tracked) {
        tracked.response = now();
        tracked.status = valid ? status : null;
        addEvent('response', tracked.id, tracked.frame);
      } else bump('orphan');
      if (!valid) {
        bump('errors');
        return;
      }
      if (!request.isNavigationRequest() || item.frame() !== page.mainFrame())
        return;
      if (responses.length === 20) {
        truncated = true;
        return;
      }
      const observed: (typeof responses)[number] = {
        item,
        status,
        body: 'unavailable',
      };
      responses.push(observed);
      if (typeof item.finished === 'function') {
        observed.body = 'pending';
        void item.finished().then(
          (error) => {
            if (!closed) observed.body = error ? 'failed' : 'finished';
          },
          () => {
            if (!closed) observed.body = 'failed';
          }
        );
      }
    });
  const onDomContentLoaded = () =>
    safe(() => {
      domContentLoaded = true;
    });
  const onLoad = () =>
    safe(() => {
      load = true;
    });
  const onFinished = (r: Request) => terminal(r, 'finished');
  const onFailed = (r: Request) => terminal(r, 'failed');
  const attached = (f: Frame) => onFrame(f, 'attached');
  const navigated = (f: Frame) => onFrame(f, 'navigated');
  const detached = (f: Frame) => onFrame(f, 'detached');
  const cleanup: (() => void)[] = [];
  const listen = (add: () => void, remove: () => void) =>
    safe(() => {
      cleanup.push(remove);
      add();
    });
  try {
    listen(
      () => page.on('request', onRequest),
      () => page.off('request', onRequest)
    );
    listen(
      () => page.on('response', response),
      () => page.off('response', response)
    );
    listen(
      () => page.on('requestfinished', onFinished),
      () => page.off('requestfinished', onFinished)
    );
    listen(
      () => page.on('requestfailed', onFailed),
      () => page.off('requestfailed', onFailed)
    );
    listen(
      () => page.on('frameattached', attached),
      () => page.off('frameattached', attached)
    );
    listen(
      () => page.on('framenavigated', navigated),
      () => page.off('framenavigated', navigated)
    );
    listen(
      () => page.on('framedetached', detached),
      () => page.off('framedetached', detached)
    );
    listen(
      () => page.on('domcontentloaded', onDomContentLoaded),
      () => page.off('domcontentloaded', onDomContentLoaded)
    );
    listen(
      () => page.on('load', onLoad),
      () => page.off('load', onLoad)
    );
    safe(() => {
      for (const frame of page.frames()) onFrame(frame, 'initial');
    });
    return await navigate();
  } catch (error) {
    closed = true;
    try {
      const diagnostics = {
        version: 1,
        lifecycle: { domContentLoaded, load },
        hops: responses.map(({ item, status, body }) => {
          try {
            return {
              ...profileNavigationEdge(
                item.url(),
                item.request().redirectedTo()?.url(),
                origin
              ),
              ...responseProxyProvenance(item),
              status,
              body,
            };
          } catch {
            return {
              ...profileNavigationEdge('', undefined, origin),
              status,
              body,
            };
          }
        }),
        truncated,
        loadObservation: {
          version: 1,
          observedAt: 'callback-rejection',
          coverage: 'unknown',
          limits: {
            requests: 64,
            frames: 16,
            events: 128,
            bytes: 49152,
            counter: 65535,
          },
          counts: { ...counts },
          saturated,
          byteTruncated: false,
          omitted: { requests: 0, frames: 0, events: 0 },
          requests: [...requests.values()].map((item) => ({ ...item })),
          frames: [...frames.values()].map((item) => ({ ...item })),
          events: events.map((item) => ({ ...item })),
        },
      };
      const snapshot = diagnostics.loadObservation;
      let encoded = JSON.stringify(diagnostics);
      while (Buffer.byteLength(encoded, 'utf8') > 49152) {
        snapshot.byteTruncated = true;
        if (snapshot.events.length) {
          snapshot.events.pop();
          snapshot.omitted.events++;
        } else if (snapshot.requests.length) {
          snapshot.requests.pop();
          snapshot.omitted.requests++;
        } else if (snapshot.frames.length) {
          snapshot.frames.pop();
          snapshot.omitted.frames++;
        } else break;
        encoded = JSON.stringify(diagnostics);
      }
      if (Buffer.byteLength(encoded, 'utf8') <= 49152)
        console.warn('[lettin-e2e] profile navigation diagnostics', encoded);
    } catch {
      /* Preserve the original rejection even if diagnostics cannot be emitted. */
    }
    throw error;
  } finally {
    closed = true;
    for (const remove of cleanup) {
      try {
        remove();
      } catch {
        /* Best-effort independent removal. */
      }
    }
    requests.clear();
    frames.clear();
    responses.length = 0;
    events.length = 0;
  }
}
