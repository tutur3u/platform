export function GET() {
  const commit = process.env.PLATFORM_BUILD_COMMIT_HASH;
  if (!commit || !/^[a-f0-9]{40}$/.test(commit)) {
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  return Response.json(
    { commit, platform: 'cloudflare' },
    {
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

export function HEAD() {
  const response = GET();
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
