import { setTimeout as delay } from 'node:timers/promises';

/** One absolute cancellation boundary for requests, bodies and startup waits. */
export function runtimeDeadline(testSignal, milliseconds) {
  const signal = AbortSignal.any([
    testSignal,
    AbortSignal.timeout(milliseconds),
  ]);
  const check = () => signal.throwIfAborted();
  return {
    signal,
    check,
    async fetch(url, init = {}, probeMilliseconds) {
      check();
      const requestSignal = probeMilliseconds
        ? AbortSignal.any([signal, AbortSignal.timeout(probeMilliseconds)])
        : signal;
      return fetch(url, { ...init, signal: requestSignal });
    },
    async text(response) {
      check();
      const result = await response.text();
      check();
      return result;
    },
    async json(response) {
      check();
      const result = await response.json();
      check();
      return result;
    },
    async wait(milliseconds) {
      check();
      await delay(milliseconds, undefined, { signal });
      check();
    },
  };
}
