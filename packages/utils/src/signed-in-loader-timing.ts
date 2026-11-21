type LoaderPhase =
  | 'proxy'
  | 'actor'
  | 'workspace-actor'
  | 'workspace'
  | 'staff'
  | 'invitation'
  | 'profile'
  | 'calendar-actor'
  | 'calendar-workspace'
  | 'permissions'
  | 'google-token'
  | 'scheduling-tasks'
  | 'linked-event'
  | 'connections';

function timingRecorder(responseHeaders?: Headers) {
  const phases = new Map<LoaderPhase, number>();
  return {
    async measure<T>(phase: LoaderPhase, work: () => PromiseLike<T>) {
      if (!responseHeaders) return work();
      const startedAt = performance.now();
      try {
        return await work();
      } finally {
        const elapsed = performance.now() - startedAt;
        if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 1_000_000) {
          phases.set(phase, Math.round(elapsed * 10) / 10);
        }
      }
    },
    async appendToResponse(isQaFixture: () => Promise<boolean>) {
      if (!responseHeaders || phases.size === 0 || !(await isQaFixture()))
        return;
      responseHeaders.append(
        'Server-Timing',
        [...phases].map(([phase, ms]) => `${phase};dur=${ms}`).join(', ')
      );
    },
  };
}

const inactive = timingRecorder();
const requests = new WeakMap<Headers, ReturnType<typeof timingRecorder>>();

export function signedInLoaderTiming(
  request?: Request,
  responseHeaders?: Headers
) {
  if (
    !responseHeaders ||
    request?.method !== 'GET' ||
    request.headers.get('sec-fetch-dest') !== 'document' ||
    request.headers.get('x-tuturuuu-qa-timing') !== '1'
  )
    return inactive;

  const existing = requests.get(responseHeaders);
  if (existing) return existing;
  const timing = timingRecorder(responseHeaders);
  requests.set(responseHeaders, timing);
  return timing;
}

export type SignedInLoaderTiming = ReturnType<typeof signedInLoaderTiming>;
