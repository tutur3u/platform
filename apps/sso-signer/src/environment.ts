/**
 * `SSO_SIGNER_ENV`: the environment this deployment serves. It names the
 * Durable Objects and is the audience that every request HMAC and every
 * finalization permit must carry, so a request or permit minted for one
 * environment is refused by every other. Each environment also holds its
 * own request, permit and control keys. Anything but a known name refuses
 * every call with `misconfigured`.
 *
 * Tuturuuu has no staging signer: `production` is the deployed Worker
 * (behind the stop fence and the SAML flag) and `local` is a developer's
 * workerd.
 */
export const SIGNER_ENVIRONMENTS = Object.freeze([
  'production',
  'local',
] as const);
export type SignerEnvironment = (typeof SIGNER_ENVIRONMENTS)[number];

export function parseSignerEnvironment(raw: unknown): SignerEnvironment | null {
  return SIGNER_ENVIRONMENTS.find((name) => name === raw) ?? null;
}
