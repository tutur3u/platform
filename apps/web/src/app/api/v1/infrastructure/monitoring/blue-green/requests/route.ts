import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringRequestArchive } from '@/lib/infrastructure/blue-green-monitoring';
import { authorizeInfrastructureViewer } from '../authorization';

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTimeframeDays(value: string | null) {
  if (!value) {
    return 7;
  }

  if (value === 'all') {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 7;
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
    const timeframeDays = parseTimeframeDays(searchParams.get('timeframeDays'));

    return NextResponse.json(
      readBlueGreenMonitoringRequestArchive({
        page,
        pageSize,
        timeframeDays,
      })
    );
  } catch (error) {
    console.error(
      'Failed to load blue-green monitoring request archive:',
      error
    );
    return NextResponse.json(
      { message: 'Failed to load blue-green monitoring request archive' },
      { status: 500 }
    );
  }
}
