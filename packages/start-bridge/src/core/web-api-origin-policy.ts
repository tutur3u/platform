/**
 * The key `@tuturuuu/internal-api` reads to find the app's Web API origin
 * policy (`packages/internal-api/src/origin-policy.ts` holds the same literal).
 * It is a registered global because the Worker's rsc and ssr module graphs are
 * separate instances in one isolate.
 */
export const WEB_API_ORIGIN_POLICY_KEY = Symbol.for(
  'tuturuuu.internalApi.webApiOriginPolicy'
);

type Resolve = (env: Record<string, string | undefined>) => string;

/**
 * Publishes an app's origin resolver (it returns the trusted origin and throws
 * on an untrusted one) so server code that sends credentials to
 * `INTERNAL_WEB_API_ORIGIN` validates the same value the bridge does.
 */
export function publishWebApiOriginPolicy(resolve: Resolve) {
  (globalThis as Record<symbol, unknown>)[WEB_API_ORIGIN_POLICY_KEY] = resolve;
}
