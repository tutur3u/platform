import { NextResponse } from 'next/server';

// Async to match the start-bridge NextProxy contract; behaviour is unchanged.
export async function proxy(): Promise<NextResponse> {
  return NextResponse.next();
}

export const config = { matcher: [] };
