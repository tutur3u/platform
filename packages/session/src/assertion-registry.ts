/**
 * Tracks the assertion objects the verifier returned. It is internal to the
 * package and not exported from any entry point. Only one module may hold the
 * write capability: the verifier claims it when it loads, and any later claim
 * throws, so another module cannot enroll objects of its own.
 */
const issued = new WeakSet<object>();
let claimed = false;

export function claimAssertionRegistrar(): <T extends object>(
  assertion: T
) => T {
  if (claimed) throw new Error('The assertion registrar is already claimed');
  claimed = true;
  return (assertion) => {
    issued.add(assertion);
    return assertion;
  };
}

export function isIssuedAssertion(value: unknown): boolean {
  return typeof value === 'object' && value !== null && issued.has(value);
}
