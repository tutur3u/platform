/**
 * The bytes a fleet publisher request signs, before the `<timestamp>.` prefix
 * the shared Mastermind HMAC adds. Method, path and query are bound so a signed
 * state upload cannot be replayed against the answers or ack routes. Each
 * signature is accepted once, so a bodiless GET carries a `nonce` query value.
 */
export function fleetSignedPayload(
  method: string,
  pathWithQuery: string,
  rawBody: string
) {
  return `${method.toUpperCase()} ${pathWithQuery}\n${rawBody}`;
}

export const FLEET_ROUTES = {
  state: '/api/v1/mastermind/fleet/state',
  answers: '/api/v1/mastermind/fleet/answers',
} as const;
