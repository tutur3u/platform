import { NextResponse } from 'next/server';
import { readBlueGreenMonitoringRequestArchive } from '@/lib/infrastructure/blue-green-monitoring';
import { serverLogger } from '@/lib/infrastructure/log-drain';
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

function parseStringFilter(value: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== 'all' ? trimmed : undefined;
}

function parseTimestampFilter(value: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    const q = parseStringFilter(searchParams.get('q'));
    const status = parseStringFilter(searchParams.get('status'));
    const route = parseStringFilter(searchParams.get('route'));
    const render = parseStringFilter(searchParams.get('render'));
    const since = parseTimestampFilter(searchParams.get('since'));
    const until = parseTimestampFilter(searchParams.get('until'));
    const traffic = parseStringFilter(searchParams.get('traffic'));

    return NextResponse.json(
      readBlueGreenMonitoringRequestArchive({
        page,
        pageSize,
        q,
        render,
        route,
        since,
        status,
        timeframeDays,
        until,
        traffic,
      })
    );
  } catch (error) {
    serverLogger.error(
      'Failed to load blue-green monitoring request archive:',
      error
    );
    return NextResponse.json(
      { message: 'Failed to load blue-green monitoring request archive' },
      { status: 500 }
    );
  }
}
