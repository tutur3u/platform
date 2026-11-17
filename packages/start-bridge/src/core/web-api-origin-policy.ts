/** The internal-api reader uses this key across the SSR and RSC module graphs. */
const POLICY_KEY = Symbol.for('tuturuuu.internalApi.webApiOriginPolicy');

/** Install once per Worker artifact; resolve live bindings on every read. */
export function publishWebApiOriginPolicy(
  policy: (env: Record<string, string | undefined>) => string
) {
  (globalThis as Record<symbol, unknown>)[POLICY_KEY] = policy;
}
