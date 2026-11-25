export function hasFeatureFlagWriteIntent(request: Request): boolean {
  if (request.headers.has('authorization')) return true;

  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  try {
    return (
      origin !== null &&
      origin === new URL(origin).origin &&
      origin === new URL(request.url).origin &&
      request.headers.get('x-tuturuuu-feature-flag-action') === '1' &&
      (fetchSite === null || fetchSite === 'same-origin')
    );
  } catch {
    return false;
  }
}
