import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireDevboxActor } from '@/lib/devboxes/authorization';

export async function POST(request: NextRequest) {
  const authorization = await requireDevboxActor(request);
  if (!authorization.ok) return authorization.response;

  return NextResponse.json({ message: 'Devbox cache prune requested.' });
}
