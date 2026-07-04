import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type CachedTrustEntry,
  setCachedTrustEntry,
} from '@tuturuuu/utils/abuse-protection/edge-trust';
import { type NextRequest, NextResponse } from 'next/server';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

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

function parseAbsoluteReadLimits(
  absoluteLimits: unknown
): CachedTrustEntry['abs'] | undefined {
  if (!absoluteLimits || typeof absoluteLimits !== 'object') {
    return undefined;
  }
  const read = (absoluteLimits as Record<string, unknown>).read;
  if (!read || typeof read !== 'object') {
    return undefined;
  }
  const source = read as Record<string, unknown>;
  const abs: { minute?: number; hour?: number; day?: number } = {};
  for (const window of ['minute', 'hour', 'day'] as const) {
    const parsed = parseMultiplier(source[window] as number | string | null);
    if (parsed != null && parsed > 0) {
      abs[window] = Math.floor(parsed);
    }
  }
  return abs.minute != null || abs.hour != null || abs.day != null
    ? abs
    : undefined;
}

/**
 * Builds the edge cache entry for a row, or null when the row has no read-edge
 * effect (a pure multiplier <= 1).
 */
function buildCacheEntry(row: {
  limit_mode: string | null;
  trust_multiplier: number | string | null;
  absolute_limits: unknown;
}): CachedTrustEntry | null {
  const multiplier = parseMultiplier(row.trust_multiplier) ?? 1;

  if (row.limit_mode === 'unlimited') {
    return { m: multiplier, mode: 'unlimited' };
  }

  if (row.limit_mode === 'absolute') {
    const abs = parseAbsoluteReadLimits(row.absolute_limits);
    if (abs) {
      return { abs, m: multiplier, mode: 'absolute' };
    }
    // Absolute rule with no READ limits has no edge effect beyond its multiplier.
  }

  return multiplier > 1 ? { m: multiplier } : null;
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
      console.error('Failed to load trusted subjects for cache', error);
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
          const entry = buildCacheEntry(row);
          if (!subjectKey || !entry) {
            skipped += 1;
            return;
          }

          await setCachedTrustEntry(subjectKey, entry, RECONCILE_TTL_SECONDS);
          written += 1;
        })
      );
    }

    console.info('Reconciled edge trust cache', {
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
    console.error('Failed to sync edge trust cache', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to sync trust cache' },
      { status: 500 }
    );
  }
}
