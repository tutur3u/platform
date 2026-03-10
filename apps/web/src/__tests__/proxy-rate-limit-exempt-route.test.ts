import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isProxyRateLimitExemptApiRoute } from '../lib/proxy-rate-limit-exempt-route';

describe('isProxyRateLimitExemptApiRoute', () => {
  const envSnapshot = {
    CRON_SECRET: process.env.CRON_SECRET,
    VERCEL_CRON_SECRET: process.env.VERCEL_CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_WEBHOOK_SECRET: process.env.SUPABASE_WEBHOOK_SECRET,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
  };

  beforeEach(() => {
    process.env.CRON_SECRET = envSnapshot.CRON_SECRET;
    process.env.VERCEL_CRON_SECRET = envSnapshot.VERCEL_CRON_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      envSnapshot.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_WEBHOOK_SECRET = envSnapshot.SUPABASE_WEBHOOK_SECRET;
    process.env.POLAR_WEBHOOK_SECRET = envSnapshot.POLAR_WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env.CRON_SECRET = envSnapshot.CRON_SECRET;
    process.env.VERCEL_CRON_SECRET = envSnapshot.VERCEL_CRON_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      envSnapshot.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_WEBHOOK_SECRET = envSnapshot.SUPABASE_WEBHOOK_SECRET;
    process.env.POLAR_WEBHOOK_SECRET = envSnapshot.POLAR_WEBHOOK_SECRET;
  });

  it('matches cron routes only with an allowed bearer token', () => {
    process.env.CRON_SECRET = 'cron-secret';

    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/cron/process-notification-batches',
        new Headers({ authorization: 'Bearer cron-secret' })
      )
    ).toBe(true);

    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/cron/tasks/deadline-reminders',
        new Headers({ authorization: 'Bearer wrong-secret' })
      )
    ).toBe(false);
  });

  it('matches supabase webhooks only with the webhook secret header', () => {
    process.env.SUPABASE_WEBHOOK_SECRET = 'supabase-webhook-secret';

    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/v1/webhooks/tasks/embedding',
        new Headers({ 'x-webhook-secret': 'supabase-webhook-secret' })
      )
    ).toBe(true);

    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/v1/webhooks/tasks/embedding',
        new Headers()
      )
    ).toBe(false);
  });

  it('matches polar webhooks only with signature headers present', () => {
    process.env.POLAR_WEBHOOK_SECRET = 'polar-webhook-secret';

    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/payment/webhooks',
        new Headers({
          'webhook-id': 'id',
          'webhook-timestamp': '1234567890',
          'webhook-signature': 'signature',
        })
      )
    ).toBe(true);

    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/payment/webhooks',
        new Headers({ 'webhook-id': 'id' })
      )
    ).toBe(false);
  });

  it('does not match unrelated paths or missing credentials', () => {
    expect(
      isProxyRateLimitExemptApiRoute('/payment/webhooks', new Headers())
    ).toBe(false);
    expect(isProxyRateLimitExemptApiRoute('/webhooks', new Headers())).toBe(
      false
    );
    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/v1/workspaces/ws/cron/jobs',
        new Headers({ authorization: 'Bearer cron-secret' })
      )
    ).toBe(false);
    expect(
      isProxyRateLimitExemptApiRoute(
        '/api/payment/my-webhooks-config',
        new Headers({
          'webhook-id': 'id',
          'webhook-timestamp': '1234567890',
          'webhook-signature': 'signature',
        })
      )
    ).toBe(false);
  });
});
