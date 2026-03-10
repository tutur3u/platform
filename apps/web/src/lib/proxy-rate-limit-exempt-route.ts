function hasBearerToken(headers: Headers, secrets: Array<string | undefined>) {
  const authHeader = headers.get('authorization');

  return secrets.some(
    (secret) => !!secret && authHeader === `Bearer ${secret}`
  );
}

function hasPolarWebhookSignatureHeaders(headers: Headers) {
  return (
    !!headers.get('webhook-id') &&
    !!headers.get('webhook-timestamp') &&
    !!headers.get('webhook-signature')
  );
}

export function isProxyRateLimitExemptApiRoute(
  pathname: string,
  headers: Headers
): boolean {
  if (!pathname.startsWith('/api')) {
    return false;
  }

  if (pathname === '/api/cron' || pathname.startsWith('/api/cron/')) {
    return hasBearerToken(headers, [
      process.env.CRON_SECRET,
      process.env.VERCEL_CRON_SECRET,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ]);
  }

  if (
    pathname === '/api/payment/webhooks' ||
    pathname.startsWith('/api/payment/webhooks/')
  ) {
    return (
      !!process.env.POLAR_WEBHOOK_SECRET &&
      hasPolarWebhookSignatureHeaders(headers)
    );
  }

  if (
    pathname === '/api/v1/webhooks' ||
    pathname.startsWith('/api/v1/webhooks/')
  ) {
    return (
      !!process.env.SUPABASE_WEBHOOK_SECRET &&
      headers.get('x-webhook-secret') === process.env.SUPABASE_WEBHOOK_SECRET
    );
  }

  return false;
}
