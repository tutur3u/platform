/** Workers expose WebSocketPair even when nodejs_compat provides process. */
export function isWorkerRuntime() {
  return 'WebSocketPair' in globalThis;
}
