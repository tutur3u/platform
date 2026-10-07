// The weak key follows the verified provider lifetime, including actor ABA.
const lifetimes = new WeakMap<object, number>();
let nextLifetime = 0;
export function invoiceActorLifetimeKey(lifetime: object) {
  let key = lifetimes.get(lifetime);
  if (key === undefined) {
    key = ++nextLifetime;
    lifetimes.set(lifetime, key);
  }
  return key;
}
