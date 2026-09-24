/** Private service-binding transport. This handler is never attached to a public route. */
export async function proxyMeetingProvider(
  request: Request,
  apiKey: string,
  send: typeof fetch = fetch
) {
  const url = new URL(request.url);
  if (
    request.method !== 'POST' ||
    url.protocol !== 'https:' ||
    url.hostname !== 'generativelanguage.googleapis.com' ||
    url.port ||
    !/^\/v1beta\/models\/gemini-[a-zA-Z0-9._-]+:(generateContent|streamGenerateContent|countTokens)$/u.test(
      url.pathname
    )
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!apiKey) return new Response('Provider unavailable', { status: 503 });
  const reader = request.body?.getReader();
  if (!reader) return new Response('Body required', { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > 12_000_000) {
      await reader.cancel();
      return new Response('Request too large', { status: 413 });
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const target = new URL(
    url.pathname,
    'https://generativelanguage.googleapis.com'
  );
  if (url.searchParams.get('alt') === 'sse')
    target.searchParams.set('alt', 'sse');
  const response = await send(target, {
    method: 'POST',
    body: bytes,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: request.signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    return Response.json(
      { error: { message: 'Meeting provider request failed' } },
      { status: response.status >= 400 ? response.status : 502 }
    );
  }
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'no-store',
      ...(response.headers.has('Content-Encoding')
        ? { 'Content-Encoding': response.headers.get('Content-Encoding')! }
        : {}),
    },
  });
}
