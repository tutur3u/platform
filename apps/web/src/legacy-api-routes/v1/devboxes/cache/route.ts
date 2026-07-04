import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';

export async function GET(request: NextRequest) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  return NextResponse.json({ caches: [] });
}
