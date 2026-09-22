export function mergeHeaders(
  defaultHeaders?: HeadersInit,
  requestHeaders?: HeadersInit
): Headers {
  const headers = new Headers(defaultHeaders);

  if (requestHeaders) {
    const nextHeaders = new Headers(requestHeaders);
    nextHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // Workers do not add the User-Agent that Node fetch supplies. Identify
  // server requests explicitly; browser requests retain their native agent.
  if (typeof window === 'undefined' && !headers.has('User-Agent')) {
    headers.set('User-Agent', 'Tuturuuu-Internal-API/1.0');
  }

  return headers;
}
