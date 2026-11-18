const marketingApps = ['meet', 'ai'];
const localePrefixes = ['', '/:locale(en|vi)'];
const marketingRedirectStatus = 307;

/** Remove reserved-path redirects at mount cutover; never make them permanent. */
export function createProductMarketingRedirects() {
  // One source per locale prefix covers every app, which keeps the Vercel
  // route table small.
  return localePrefixes.flatMap((prefix) => [
    {
      source: `${prefix}/:app(${marketingApps.join('|')})`,
      destination: `${prefix ? '/:locale' : ''}/products/:app`,
      statusCode: marketingRedirectStatus,
    },
    {
      source: `${prefix}/meet/plans/:planId`,
      destination: `${prefix ? '/:locale' : ''}/products/meet/plans/:planId`,
      statusCode: marketingRedirectStatus,
    },
  ]);
}
