/** Forwarded host headers are deliberately outside this trust boundary. */
export function hasEmployeeRequestOrigin(
  request: Request,
  trustedOrigin = new URL(request.url).origin
) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  return (
    (origin === null || origin === trustedOrigin) &&
    (site === null || site === 'same-origin')
  );
}
