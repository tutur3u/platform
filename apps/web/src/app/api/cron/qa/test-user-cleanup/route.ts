import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';
import { deleteQaUsers } from '@/lib/qa-test-users/deletion';
import { QA_CLEANUP_LIMIT } from '@/lib/qa-test-users/policy';
import { createQaDeletionDeps } from '@/lib/qa-test-users/runtime';
import { createQaStore } from '@/lib/qa-test-users/store';

const PATH = '/api/cron/qa/test-user-cleanup';
// Inside the 90-second Cron Control timeout, with margin for the last delete.
const CLEANUP_BUDGET_MS = 60_000;
const headers = { 'Cache-Control': 'no-store' };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(
    digest(request.headers.get('authorization') ?? ''),
    digest(`Bearer ${secret}`)
  );
}

/** Cloudflare Cron Control slot: deletes expired QA test accounts. */
export async function POST(request: Request) {
  return withCronLogDrain(
    { jobId: 'web-qa-test-user-cleanup', path: PATH, request },
    async () => {
      if (!authorized(request))
        return Response.json(
          { error: 'Unauthorized' },
          { status: 401, headers }
        );
      try {
        const admin = (await createAdminClient({
          noCookie: true,
        })) as TypedSupabaseClient;
        const due = await createQaStore(admin).listExpired(QA_CLEANUP_LIMIT);
        if (due.mode === 'fenced')
          return Response.json({ ok: true, fenced: true }, { headers });
        const result = await deleteQaUsers(
          createQaDeletionDeps(admin),
          due.userIds,
          'cron',
          null,
          { deadline: Date.now() + CLEANUP_BUDGET_MS }
        );
        return Response.json(
          {
            ok: result.pending.length === 0,
            deleted: result.deleted.length,
            pending: result.pending.length,
            skipped: result.skipped.length,
          },
          { headers, status: result.pending.length === 0 ? 200 : 502 }
        );
      } catch (error) {
        console.error('QA test user cleanup failed', {
          errorType: error instanceof Error ? error.name : 'unknown',
        });
        return Response.json(
          { ok: false, error: 'QA test user cleanup unavailable' },
          { status: 503, headers }
        );
      }
    }
  );
}
