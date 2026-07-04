import { type NextRequest, NextResponse } from 'next/server';
import { runHiveSimulationTick } from '@/lib/hive/simulation';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

const JOB_ID = 'hive-simulate';
const PATH = '/api/cron/hive/simulate';

export async function GET(request: NextRequest) {
  return withCronLogDrain({ jobId: JOB_ID, path: PATH, request }, () =>
    handleGET(request)
  );
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
      { status: 401 }
    );
  }

  try {
    const results = await runHiveSimulationTick();
    console.info('Hive simulation tick completed', { results });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error('Hive simulation tick failed', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Hive simulation tick failed',
      },
      { status: 500 }
    );
  }
}
