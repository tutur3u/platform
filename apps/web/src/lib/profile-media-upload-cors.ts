import { getAppDomainByUrl } from '@tuturuuu/utils/internal-domains';

/** CORS visibility only; the signed PUT capability remains the upload authority. */
export function getProfileMediaUploadOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  try {
    const url = new URL(origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.origin !== origin
    )
      return null;

    const registered = getAppDomainByUrl(origin);
    if (!registered) return null;
    const registeredUrl = new URL(registered.url);
    // The registry resolver also upgrades HTTP to HTTPS; CORS must not do so.
    if (url.protocol !== registeredUrl.protocol) return null;
    if (registered.kind === 'external' && origin !== registeredUrl.origin)
      return null;
    return origin;
  } catch {
    return null;
  }
}

function appendVary(headers: Headers, name: string) {
  const existing = headers.get('vary');
  const values = existing?.split(',').map((value) => value.trim()) ?? [];
  if (!values.some((value) => value.toLowerCase() === name.toLowerCase()))
    headers.set('Vary', existing ? `${existing}, ${name}` : name);
}

export function withProfileMediaUploadCors(
  request: Request,
  response: Response
): Response {
  appendVary(response.headers, 'Origin');
  const origin = getProfileMediaUploadOrigin(request);
  if (origin) response.headers.set('Access-Control-Allow-Origin', origin);
  return response;
}

/** Does not inspect the capability, cookies or body, or access any upload service. */
export function profileMediaUploadOptions(request: Request): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of [
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ])
    appendVary(headers, name);

  const origin = getProfileMediaUploadOrigin(request);
  const method = request.headers.get('access-control-request-method');
  const requestedHeaders = request.headers.get(
    'access-control-request-headers'
  );
  const allowedHeaders =
    requestedHeaders === null ||
    requestedHeaders
      .split(',')
      .every((name) => name.trim().toLowerCase() === 'content-type');
  if (!origin || method !== 'PUT' || !allowedHeaders)
    return new Response(null, { status: 403, headers });

  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'PUT');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(null, { status: 204, headers });
}
