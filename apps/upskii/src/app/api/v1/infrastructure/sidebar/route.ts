import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { cookies as c } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const cookies = await c();
  const { collapsed } = await req.json();

  // Check if collapsed is provided
  if (collapsed === undefined) {
    return NextResponse.json(
      { message: 'Collapse is required' },
      { status: 500 }
    );
  }

  cookies.set(SIDEBAR_COLLAPSED_COOKIE_NAME, collapsed);
  return NextResponse.json({ message: 'Success' });
}

export async function DELETE() {
  const cookies = await c();

  cookies.delete(SIDEBAR_COLLAPSED_COOKIE_NAME);
  return NextResponse.json({ message: 'Success' });
}
