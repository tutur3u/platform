import { type NextRequest, NextResponse } from 'next/server';
import { POST as capture } from '@/lib/cite/api/capture';
import { POST as fixRef } from '@/lib/cite/api/fix-ref';
import { POST as format } from '@/lib/cite/api/format';
import { POST as lookup } from '@/lib/cite/api/lookup';
import { POST as validate } from '@/lib/cite/api/validate';

// One dynamic route serves every Cite action so the deployment keeps a single
// route entry; each action keeps its own auth, limits and budgets.
const actions: Record<
  string,
  (request: NextRequest) => Promise<Response> | Response
> = {
  'ai/fix-ref': fixRef,
  capture,
  format,
  lookup,
  validate,
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const action = path.join('/');
  const handler = Object.hasOwn(actions, action) ? actions[action] : undefined;
  if (!handler)
    return NextResponse.json(
      { error: 'NOT_FOUND' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  return handler(request);
}
