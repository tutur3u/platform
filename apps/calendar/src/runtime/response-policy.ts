import { createTuturuuuNextConfig } from '@tuturuuu/utils/next-config';

// Read the same source and exceptions as Calendar's retained Next configuration.
async function canonicalPolicy() {
  const headers = await createTuturuuuNextConfig().headers?.();
  const rule = headers?.find(({ headers }) =>
    headers.some(({ key }) => key.toLowerCase() === 'x-frame-options')
  );
  if (!rule?.source.startsWith('/:path(') || !rule.source.endsWith(')'))
    throw new Error('Unsupported canonical Calendar response policy');
  return {
    matches: new RegExp(`^/${rule.source.slice('/:path('.length, -1)}$`, 'u'),
    headers: rule.headers,
  };
}

const policy = canonicalPolicy();

export async function applyCalendarResponsePolicy(
  request: Request,
  response: Response
) {
  const canonical = await policy;
  if (!canonical.matches.test(new URL(request.url).pathname)) return response;
  const headers = new Headers(response.headers);
  for (const { key, value } of canonical.headers) {
    if (key.toLowerCase() === 'content-security-policy' && headers.has(key)) {
      if (headers.get(key) !== value) headers.append(key, value);
    } else headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
