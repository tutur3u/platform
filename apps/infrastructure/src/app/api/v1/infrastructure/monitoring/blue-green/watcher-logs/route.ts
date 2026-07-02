import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringWatcherLogArchive } from '@/lib/infrastructure/blue-green-monitoring';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInfrastructureViewer } from '../authorization';

function parsePositiveInt(value: string | null, fallback: number) {
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
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 25);

    return NextResponse.json(
      readBlueGreenMonitoringWatcherLogArchive({
        page,
        pageSize,
      })
    );
  } catch (error) {
    serverLogger.error(
      'Failed to load blue-green monitoring watcher log archive:',
      error
    );
    return NextResponse.json(
      { message: 'Failed to load blue-green monitoring watcher log archive' },
      { status: 500 }
    );
  }
}
