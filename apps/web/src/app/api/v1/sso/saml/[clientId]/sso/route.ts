import type { NextRequest } from 'next/server';
import { start } from '@/lib/sso/http';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  return start(request, (await context.params).clientId);
}
export const POST = GET;
