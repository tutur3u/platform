const marketingApps = ['meet', 'calendar', 'ai'];
const localePrefixes = ['', '/:locale(en|vi)'];
const marketingRedirectStatus = 307;

/** Remove reserved-path redirects at mount cutover; never make them permanent. */
export function createProductMarketingRedirects() {
  return localePrefixes.flatMap((prefix) => [
    ...marketingApps.map((app) => ({
      source: `${prefix}/${app}`,
      destination: `${prefix ? '/:locale' : ''}/products/${app}`,
      statusCode: marketingRedirectStatus,
    })),
    {
      source: `${prefix}/meet/plans/:planId`,
      destination: `${prefix ? '/:locale' : ''}/products/meet/plans/:planId`,
      statusCode: marketingRedirectStatus,
    },
  ]);
}
