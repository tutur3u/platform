import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { setCachedTrustMultiplier } from '@tuturuuu/utils/abuse-protection/edge-trust';
import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger, withCronLogDrain } from '@/lib/infrastructure/log-drain';

const JOB_ID = 'infrastructure-sync-trust-cache';
const PATH = '/api/cron/infrastructure/sync-trust-cache';

// Reconciled entries get a longer TTL than the per-request write-through so the
// cache survives between cron runs (every 10 minutes).
const RECONCILE_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const WRITE_CONCURRENCY = 32;

export async function GET(request: NextRequest) {
  return withCronLogDrain({ jobId: JOB_ID, path: PATH, request }, () =>
    handleGET(request)
  );
}

function parseMultiplier(value: number | string | null): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function handleGET(request: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
      { status: 500 }
    );
  }

  if (request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      {
        status: 401,
      }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin.rpc(
      'list_trusted_subjects_for_cache',
      {}
    );

    if (error) {
      serverLogger.error('Failed to load trusted subjects for cache', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to load trusted subjects' },
        { status: 500 }
      );
    }

    const rows = data ?? [];
    let written = 0;
    let skipped = 0;

    for (let index = 0; index < rows.length; index += WRITE_CONCURRENCY) {
      const batch = rows.slice(index, index + WRITE_CONCURRENCY);
      await Promise.all(
        batch.map(async (row) => {
          const subjectKey = row.subject_key?.trim();
          const multiplier = parseMultiplier(row.trust_multiplier);
          if (!subjectKey || multiplier == null || multiplier <= 1) {
            skipped += 1;
            return;
          }

          await setCachedTrustMultiplier(
            subjectKey,
            multiplier,
            RECONCILE_TTL_SECONDS
          );
          written += 1;
        })
      );
    }

    serverLogger.info('Reconciled edge trust cache', {
      skipped,
      total: rows.length,
      written,
    });

    return NextResponse.json({
      ok: true,
      skipped,
      total: rows.length,
      written,
    });
  } catch (error) {
    serverLogger.error('Failed to sync edge trust cache', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to sync trust cache' },
      { status: 500 }
    );
  }
}
