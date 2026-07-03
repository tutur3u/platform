import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';

export async function POST(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  return NextResponse.json({ message: 'Devbox cache prune requested.' });
}
