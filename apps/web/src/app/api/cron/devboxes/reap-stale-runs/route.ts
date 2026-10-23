import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';

// Upper bound per invocation; the RPC also clamps to 500.
const REAP_LIMIT = 200;

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(
    digest(request.headers.get('authorization') ?? ''),
    digest(`Bearer ${secret}`)
  );
}

// Plain authenticated processor for the scheduled stale devbox run sweep.
// Scheduling belongs to the Cloudflare cron-control Worker; each call is
// bounded and idempotent, so overlapping or repeated invocations are safe.
async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connection();

  try {
    const admin = await createAdminClient({ noCookie: true });
    const { data, error } = await (
      admin as unknown as {
        schema: (schema: string) => {
          rpc: (
            fn: string,
            args: Record<string, unknown>
          ) => Promise<{ data: unknown; error: unknown }>;
        };
      }
    )
      .schema('private')
      .rpc('reap_stale_devbox_runs', { p_limit: REAP_LIMIT });
    if (error) throw error;

    const reaped = typeof data === 'number' ? data : 0;
    if (reaped > 0) {
      console.warn(`Reaped ${reaped} stale devbox run(s)`);
    }
    return NextResponse.json({ limit: REAP_LIMIT, reaped });
  } catch (error) {
    console.error('Stale devbox run reap failed:', error);
    return NextResponse.json(
      { error: 'Stale devbox run reap failed' },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
