import { NextResponse } from 'next/server';
import { authorizeDevboxCollector } from '@/lib/devboxes/collector-auth';
export async function POST(request: Request) {
  const auth = await authorizeDevboxCollector(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { message: 'Host collector ingestion is not enabled' },
    { status: 501, headers: { 'Cache-Control': 'no-store' } }
  );
}
