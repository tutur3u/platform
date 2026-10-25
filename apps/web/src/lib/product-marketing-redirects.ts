const marketingApps = ['meet', 'calendar', 'ai'];
const localePrefixes = ['', '/:locale(en|vi)'];
const meetRedirectStatus: 307 | 301 = 307;

/** Ops changes Meet's status to 301 after the three-day observation window. */
export function createProductMarketingRedirects() {
  return localePrefixes.flatMap((prefix) => [
    ...marketingApps.map((app) => ({
      source: `${prefix}/${app}`,
      destination: `${prefix ? '/:locale' : ''}/products/${app}`,
      statusCode: app === 'meet' ? meetRedirectStatus : (307 as const),
    })),
    {
      source: `${prefix}/meet/plans/:planId`,
      destination: `${prefix ? '/:locale' : ''}/products/meet/plans/:planId`,
      statusCode: meetRedirectStatus,
    },
  ]);
}
