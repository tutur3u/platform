import type { NextRequest } from 'next/server';
import { decision } from '@/lib/sso/http';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ transactionId: string }> }
) {
  return decision(request, (await context.params).transactionId);
}
