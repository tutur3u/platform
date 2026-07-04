import { NextResponse } from 'next/server';
import {
  DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS,
  MAX_REQUEST_ARCHIVE_TIMEFRAME_DAYS,
  readBlueGreenMonitoringRequestArchive,
} from '@/lib/infrastructure/blue-green-monitoring';
import { authorizeInfrastructureViewer } from '../authorization';

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTimeframeDays(
  value: string | null
): { ok: true; value: number } | { message: string; ok: false } {
  if (!value) {
    return { ok: true, value: DEFAULT_REQUEST_ARCHIVE_TIMEFRAME_DAYS };
  }

  const normalizedValue = value.trim().toLowerCase();
  const message = `timeframeDays must be an integer between 1 and ${MAX_REQUEST_ARCHIVE_TIMEFRAME_DAYS}`;

  if (normalizedValue === 'all') {
    return { message, ok: false };
  }

  const parsed = Number(normalizedValue);
  return Number.isInteger(parsed) &&
    parsed >= 1 &&
    parsed <= MAX_REQUEST_ARCHIVE_TIMEFRAME_DAYS
    ? { ok: true, value: parsed }
    : { message, ok: false };
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
    if (!timeframeDays.ok) {
      return NextResponse.json(
        { message: timeframeDays.message },
        { status: 400 }
      );
    }

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
        timeframeDays: timeframeDays.value,
        until,
        traffic,
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
