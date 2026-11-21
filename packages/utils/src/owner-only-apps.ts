/**
 * Internal apps registered for their own session handoff only: generic
 * first-party consumers (credentialed CORS, cost identity) never admit them.
 */
export const OWNER_ONLY_INTERNAL_APPS: readonly string[] = ['mastermind'];

export function isOwnerOnlyInternalApp(name: string) {
  return OWNER_ONLY_INTERNAL_APPS.includes(name);
}
