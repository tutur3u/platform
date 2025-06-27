export const fetcher = (...args: [RequestInfo, RequestInit]) =>
  fetch(...(args as [RequestInfo, RequestInit])).then((res) => res.json());
