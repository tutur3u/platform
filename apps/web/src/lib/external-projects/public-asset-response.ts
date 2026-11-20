const inlineAssetType =
  /^(?:image\/(?:avif|bmp|gif|jpeg|png|svg\+xml|webp|x-icon)|audio\/(?:aac|mpeg|ogg|wav|webm)|video\/(?:mp4|ogg|webm))$/i;

export async function publicExternalProjectAssetResponse(
  url: string,
  eligible: () => Promise<boolean>,
  headers: HeadersInit,
  requestedRange: string | null
) {
  const range =
    requestedRange &&
    /^bytes=(?:\d{1,16}-\d{0,16}|-\d{1,16})$/.test(requestedRange)
      ? requestedRange
      : null;
  const upstream = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    ...(range ? { headers: { Range: range } } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!upstream) return null;
  let handingOffBody = false;
  try {
    const contentRange = upstream.headers.get('content-range');
    const partial =
      range &&
      upstream.status === 206 &&
      contentRange &&
      /^bytes \d{1,16}-\d{1,16}\/(?:\d{1,16}|\*)$/.test(contentRange);
    if (
      (upstream.status !== 200 && !partial) ||
      !upstream.body ||
      !(await eligible())
    )
      return null;

    const contentType =
      upstream.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? '';
    const responseHeaders = new Headers(headers);
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set(
      'Content-Security-Policy',
      "sandbox; default-src 'none'"
    );
    if (inlineAssetType.test(contentType))
      responseHeaders.set('Content-Type', contentType);
    else {
      responseHeaders.set('Content-Type', 'application/octet-stream');
      responseHeaders.set('Content-Disposition', 'attachment');
    }
    if (partial) responseHeaders.set('Content-Range', contentRange);
    if (partial || upstream.headers.get('accept-ranges') === 'bytes')
      responseHeaders.set('Accept-Ranges', 'bytes');
    const response = new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
    handingOffBody = true;
    return response;
  } finally {
    if (upstream.body && !handingOffBody)
      void upstream.body.cancel().catch(() => {});
  }
}
