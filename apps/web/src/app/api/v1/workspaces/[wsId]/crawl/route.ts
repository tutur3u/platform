import { NextResponse } from 'next/server';

const CRAWLER_RETIRED_RESPONSE = {
  message: 'Crawler execution has been retired',
} as const;

export function POST() {
  return NextResponse.json(CRAWLER_RETIRED_RESPONSE, {
    status: 410,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  });
}
