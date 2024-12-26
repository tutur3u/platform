export const fetcher = (...args: any[]) =>
  fetch(...(args as [RequestInfo, RequestInit])).then((res) => res.json());
