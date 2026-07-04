import { type NextRequest, NextResponse } from 'next/server';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';
import { processDueManagedCronJobs } from '@/lib/managed-cron/service';

const JOB_ID = 'managed-workspace-cron-jobs';
const PATH = '/api/cron/workspaces/managed-jobs';

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
    const summary = await processDueManagedCronJobs();
    console.info('Processed managed workspace cron jobs', summary);

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error('Failed to process managed workspace cron jobs', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to process managed workspace cron jobs' },
      { status: 500 }
    );
  }
}
