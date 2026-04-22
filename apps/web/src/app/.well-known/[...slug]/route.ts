import { NextResponse } from 'next/server';

function buildBlockedWellKnownResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}

export async function GET() {
  return buildBlockedWellKnownResponse();
}

export async function HEAD() {
  return buildBlockedWellKnownResponse();
}
