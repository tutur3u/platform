import { NextResponse } from 'next/server';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';

export async function POST(request: Request) {
  const authorization = await authorizeDevboxAgent(request);
  if (!authorization.ok) return authorization.response;

  return NextResponse.json({ message: 'events accepted' });
}
