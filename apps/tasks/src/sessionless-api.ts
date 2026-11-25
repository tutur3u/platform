// Tasks API routes that run without an app session. Each entry is an exact
// path and method set: the proxy skips the session refresh and strips cookies
// so no ambient identity reaches the handler, which authenticates its own
// credential or is public. Any other method, sub-path, trailing slash or
// encoded variant takes the normal session path.
export type SessionlessApiRoute = {
  path: string;
  methods: readonly string[];
  // Kept only for routes that authenticate a shared secret sent as
  // `authorization: Bearer <secret>`; every other route loses the header.
  keepAuthorization: boolean;
};

export const SESSIONLESS_API_ROUTES: readonly SessionlessApiRoute[] = [
  // Public release identity.
  {
    path: '/api/build-info',
    methods: ['GET', 'HEAD'],
    keepAuthorization: false,
  },
  // CI alert sink: `x-ci-alert-token`.
  { path: '/api/v1/ci/alerts', methods: ['POST'], keepAuthorization: false },
  // Task embedding webhook: `x-webhook-secret`.
  {
    path: '/api/v1/webhooks/tasks/embedding',
    methods: ['POST'],
    keepAuthorization: false,
  },
  // Cron routes checking `authorization: Bearer <CRON_SECRET>`; cleanup-media
  // is the daily media cleanup, generate-embeddings has no scheduler.
  {
    path: '/api/cron/tasks/cleanup-media',
    methods: ['GET'],
    keepAuthorization: true,
  },
  {
    path: '/api/cron/tasks/generate-embeddings',
    methods: ['GET'],
    keepAuthorization: true,
  },
];

export function findSessionlessApiRoute(
  pathname: string,
  method: string
): SessionlessApiRoute | null {
  return (
    SESSIONLESS_API_ROUTES.find(
      (route) => route.path === pathname && route.methods.includes(method)
    ) ?? null
  );
}
