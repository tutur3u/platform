import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger, withCronLogDrain } from '@/lib/infrastructure/log-drain';
import { sampleObservabilityResources } from '@/lib/infrastructure/observability';

const JOB_ID = 'infrastructure-sample-resources';
const PATH = '/api/cron/infrastructure/sample-resources';

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
    const sample = await sampleObservabilityResources();
    serverLogger.info('Sampled infrastructure resources', sample);

    return NextResponse.json({ ok: true, sample });
  } catch (error) {
    serverLogger.error('Failed to sample infrastructure resources', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to sample infrastructure resources',
      },
      { status: 500 }
    );
  }
}
