/**
 * Tracks the assertion objects the verifier returned. It is internal to the
 * package and not exported from any entry point.
 */
const issued = new WeakSet<object>();

export function registerIssuedAssertion<T extends object>(assertion: T): T {
  issued.add(assertion);
  return assertion;
}

export function isIssuedAssertion(value: unknown): boolean {
  return typeof value === 'object' && value !== null && issued.has(value);
}
