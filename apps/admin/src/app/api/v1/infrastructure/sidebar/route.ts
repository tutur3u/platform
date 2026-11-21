import {
  getSharedAndHostOnlyCookieDeleteOptions,
  getTuturuuuSharedCookieOptions,
} from '@tuturuuu/utils/shared-cookie';
import { cookies as c } from 'next/headers';
import { NextResponse } from 'next/server';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';

const SIDEBAR_COLLAPSED_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
} as const;

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

  cookies.set(
    SIDEBAR_COLLAPSED_COOKIE_NAME,
    String(collapsed),
    getTuturuuuSharedCookieOptions(SIDEBAR_COLLAPSED_COOKIE_OPTIONS, req)
  );
  return NextResponse.json({ message: 'Success' });
}

export async function DELETE(req: Request) {
  const cookies = await c();

  for (const options of getSharedAndHostOnlyCookieDeleteOptions(
    SIDEBAR_COLLAPSED_COOKIE_OPTIONS,
    req
  )) {
    cookies.set(SIDEBAR_COLLAPSED_COOKIE_NAME, '', options);
  }
  return NextResponse.json({ message: 'Success' });
}
