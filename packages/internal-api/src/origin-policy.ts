/**
 * An app's trusted Web API origin policy: it returns the trusted origin for
 * the environment and throws when `INTERNAL_WEB_API_ORIGIN` is set to anything
 * untrusted. `@tuturuuu/start-bridge` publishes it under the same registered
 * key (`core/web-api-origin-policy.ts`); a global is needed because a Worker's
 * rsc and ssr module graphs are separate instances in one isolate.
 */
export type InternalApiOriginPolicy = (
  env: Record<string, string | undefined>
) => string;

const POLICY_KEY = Symbol.for('tuturuuu.internalApi.webApiOriginPolicy');

type PolicyHost = Record<symbol, InternalApiOriginPolicy | undefined>;

/** Registers the policy; the returned function removes it. */
export function registerInternalApiOriginPolicy(
  policy: InternalApiOriginPolicy
): () => void {
  (globalThis as PolicyHost)[POLICY_KEY] = policy;
  return () => {
    if ((globalThis as PolicyHost)[POLICY_KEY] === policy)
      delete (globalThis as PolicyHost)[POLICY_KEY];
  };
}

export function getInternalApiOriginPolicy() {
  return (globalThis as PolicyHost)[POLICY_KEY];
}
