import { clearAppSessionAndReturn } from '@tuturuuu/auth/app-session';
import { NextResponse } from 'next/server';

export function GET() {
  return clearAppSessionAndReturn(NextResponse.json({ success: true }));
}

export const POST = GET;
