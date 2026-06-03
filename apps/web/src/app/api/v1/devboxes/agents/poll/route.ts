import { NextResponse } from 'next/server';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';

export async function GET(request: Request) {
  const authorization = await authorizeDevboxAgent(request);
  if (!authorization.ok) return authorization.response;

  return NextResponse.json({ jobs: [] });
}
