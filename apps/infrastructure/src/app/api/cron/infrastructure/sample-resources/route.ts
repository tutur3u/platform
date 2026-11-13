import { authorizeInfrastructureCron } from '@/lib/infrastructure-cron-auth';
import { type NextRequest, NextResponse } from 'next/server';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';
import { sampleObservabilityResources } from '@/lib/infrastructure/observability';

const JOB_ID = 'infrastructure-sample-resources';
const PATH = '/api/cron/infrastructure/sample-resources';

export async function GET(request: NextRequest) {
  const denied = authorizeInfrastructureCron(request);
  if (denied) return denied;
  return withCronLogDrain({ jobId: JOB_ID, path: PATH, request }, () =>
    handleGET()
  );
}

async function handleGET() {
  try {
    await sampleObservabilityResources();

    return NextResponse.json({ ok: true });
  } catch {
    console.error('Infrastructure cron job failed');
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
