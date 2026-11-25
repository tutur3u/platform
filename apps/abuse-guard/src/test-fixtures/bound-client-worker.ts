/**
 * A native app Worker as the apps wire it: `configureAbuseGuardRuntime` runs
 * before routing on every request with the real `ABUSE_GUARD` service binding.
 * Used only by `bound-client.worker.test.ts`.
 */
import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import {
  configureAbuseGuardRuntime,
  selectAbuseGuard,
} from '@tuturuuu/utils/abuse-guard/select';

interface Env {
  ABUSE_GUARD?: AbuseGuardBinding;
  ABUSE_GUARD_KEY_PEPPER?: string;
  ABUSE_GUARD_FAMILIES?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // `?poison=1` makes reading the configuration throw, as an unexpected
    // binding or environment failure would before routing.
    const poisoned = url.searchParams.get('poison') === '1';
    configureAbuseGuardRuntime(
      env.ABUSE_GUARD
        ? {
            binding: env.ABUSE_GUARD,
            get pepper(): string | undefined {
              if (poisoned) throw new Error('configuration unavailable');
              return env.ABUSE_GUARD_KEY_PEPPER;
            },
            families: env.ABUSE_GUARD_FAMILIES,
          }
        : null
    );
    const selection = selectAbuseGuard('proxy', {});
    if (selection.kind !== 'durable-object') {
      return Response.json({ kind: selection.kind });
    }
    const key = url.searchParams.get('key') ?? 'k';
    const set = await selection.client.set(key, 'v', { ttlMs: 60_000 });
    const value = await selection.client.get(key);
    return Response.json({ kind: selection.kind, set, value });
  },
};
