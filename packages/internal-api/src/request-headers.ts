/**
 * `tuturuuu-<service>/1.0` for first-party server requests. The service is
 * TUTURUUU_SERVICE_NAME when set; 1.0 is the client protocol version.
 */
export function firstPartyUserAgent(
  serviceName = typeof process === 'undefined'
    ? undefined
    : process.env.TUTURUUU_SERVICE_NAME
) {
  const service = serviceName
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `tuturuuu-${service || 'internal-api'}/1.0`;
}

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
    headers.set('User-Agent', firstPartyUserAgent());
  }

  return headers;
}
