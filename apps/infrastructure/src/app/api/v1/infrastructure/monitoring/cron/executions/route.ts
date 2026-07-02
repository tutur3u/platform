import { NextResponse } from 'next/server';
import { readCronExecutionArchive } from '@/lib/infrastructure/cron-monitoring';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureViewer } from '../../blue-green/authorization';

function parseOptionalPositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const authorization = await authorizeInfrastructureViewer(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(
      readCronExecutionArchive({
        jobId: searchParams.get('jobId')?.trim() || null,
        page: parseOptionalPositiveInt(searchParams.get('page'), 1),
        pageSize: parseOptionalPositiveInt(searchParams.get('pageSize'), 25),
      })
    );
  } catch (error) {
    serverLogger.error('Failed to load cron execution archive:', error);
    return NextResponse.json(
      { message: 'Failed to load cron execution archive' },
      { status: 500 }
    );
  }
}
