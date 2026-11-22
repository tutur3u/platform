export function bindGlobalFetch(fetchImpl?: typeof fetch | null): typeof fetch {
  const implementation = fetchImpl ?? globalThis.fetch;
  return implementation === globalThis.fetch
    ? globalThis.fetch.bind(globalThis)
    : implementation;
}
