import { NextResponse } from 'next/server';
import { withServerTiming } from '@/lib/server-timing';
import { BOOTSTRAP_HEADERS, bootstrapHandler } from './handler';

/** Set to `1` to answer 404 before any auth work; clients fall back per key. */
const KILL_SWITCH_ENV = 'USER_BOOTSTRAP_DISABLED';

export const GET = withServerTiming(
  (...args: Parameters<typeof bootstrapHandler>) =>
    process.env[KILL_SWITCH_ENV] === '1'
      ? NextResponse.json(
          { error: 'not_found' },
          { status: 404, headers: BOOTSTRAP_HEADERS }
        )
      : bootstrapHandler(...args)
);
