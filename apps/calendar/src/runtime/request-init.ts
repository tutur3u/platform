export function requestInit(
  request: Request,
  headers: Headers = request.headers,
  redirect: RequestRedirect = request.redirect
) {
  return {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
    redirect,
    duplex: 'half',
  } satisfies RequestInit & { duplex: 'half' };
}
