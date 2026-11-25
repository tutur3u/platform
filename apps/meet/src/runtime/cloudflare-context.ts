import { meetRequest } from './request-context';

type MeetCloudflareContext = NonNullable<
  ReturnType<typeof meetRequest>['cloudflare']
>;

function readCloudflareContext(): MeetCloudflareContext {
  const cloudflare = meetRequest().cloudflare;
  if (!cloudflare) throw new Error('Meet Cloudflare bindings are unavailable');
  return cloudflare;
}

/**
 * Stands in for `@opennextjs/cloudflare` on the native Meet Worker, with the
 * same contract: `{ async: true }` returns a Promise (which rejects when the
 * bindings are missing), so callers may chain `.catch` on it. Returning the
 * context itself there made every `getCloudflareContext({ async: true })
 * .catch(...)` caller throw a TypeError and answer a generic 500.
 */
export function getCloudflareContext(options: {
  async: true;
}): Promise<MeetCloudflareContext>;
export function getCloudflareContext(options?: {
  async?: false;
}): MeetCloudflareContext;
export function getCloudflareContext(options?: {
  async?: boolean;
}): MeetCloudflareContext | Promise<MeetCloudflareContext>;
export function getCloudflareContext(options?: { async?: boolean }) {
  if (!options?.async) return readCloudflareContext();
  // Read inside the caller's request scope, before any await.
  try {
    return Promise.resolve(readCloudflareContext());
  } catch (error) {
    return Promise.reject(error);
  }
}
