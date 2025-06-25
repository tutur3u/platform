export const fetcher = (...args: [RequestInfo | URL, RequestInit?]) =>
  fetch(...args).then((res) => res.json());
