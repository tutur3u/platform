import type { NextRequest } from 'next/server';
import { connection } from 'next/server';
import { metadata } from '@/lib/sso/http';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  await connection();
  return metadata(request, (await context.params).clientId);
}
