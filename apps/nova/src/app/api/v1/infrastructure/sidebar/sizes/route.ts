import { cookies as c } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  MAIN_CONTENT_SIZE_COOKIE_NAME,
  SIDEBAR_SIZE_COOKIE_NAME,
} from '@/constants/common';

export async function POST(req: Request) {
  const cookies = await c();
  const { sidebar, main } = await req.json();

  // Check if sizes is provided
  if (sidebar === undefined || main === undefined) {
    return NextResponse.json({ message: 'Sizes is required' }, { status: 500 });
  }

  cookies.set(SIDEBAR_SIZE_COOKIE_NAME, sidebar);
  cookies.set(MAIN_CONTENT_SIZE_COOKIE_NAME, main);
  return NextResponse.json({ message: 'Success' });
}

export async function DELETE() {
  const cookies = await c();

  cookies.delete(SIDEBAR_SIZE_COOKIE_NAME);
  return NextResponse.json({ message: 'Success' });
}
