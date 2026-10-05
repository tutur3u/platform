import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { StoredSeriesSchema } from './schema';
import { CalendarSeriesError, hydrateSeries } from './service';

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new CalendarSeriesError(
      'Invalid JSON request body',
      400,
      'INVALID_JSON'
    );
  }
}
export function seriesFailure(error: unknown) {
  if (error instanceof CalendarSeriesError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  if (error instanceof ZodError || error instanceof RangeError)
    return NextResponse.json(
      { error: 'Invalid recurrence request', code: 'INVALID_RECURRENCE' },
      { status: 400 }
    );
  console.error('Calendar recurrence operation failed', error);
  return NextResponse.json(
    { error: 'Calendar recurrence operation failed' },
    { status: 500 }
  );
}
export async function seriesResult(raw: unknown): Promise<unknown> {
  const parsed = StoredSeriesSchema.safeParse(raw);
  if (parsed.success) return hydrateSeries(parsed.data);
  if (raw && typeof raw === 'object' && 'previous' in raw) {
    const split = raw as {
      previous: unknown;
      series?: unknown;
      discardedFutureExceptions: number;
    };
    return {
      ...split,
      previous: await seriesResult(split.previous),
      ...(split.series ? { series: await seriesResult(split.series) } : {}),
    };
  }
  return raw;
}
