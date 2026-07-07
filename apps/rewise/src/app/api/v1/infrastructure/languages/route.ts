import {
  getSharedAndHostOnlyCookieDeleteOptions,
  getTuturuuuSharedCookieOptions,
} from '@tuturuuu/utils/shared-cookie';
import { cookies as c } from 'next/headers';
import { NextResponse } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { supportedLocales } from '@/i18n/routing';

const LOCALE_COOKIE_OPTIONS = {
  maxAge: 365 * 24 * 60 * 60,
  path: '/',
  sameSite: 'lax',
} as const;

export async function POST(req: Request) {
  const cookies = await c();

  const { locale } = await req.json();

  // Check if locale is provided
  if (!locale) {
    return NextResponse.json(
      { message: 'Locale is required' },
      { status: 500 }
    );
  }

  // Check if locale is supported
  if (!supportedLocales.includes(locale))
    return NextResponse.json(
      { message: 'Locale is not supported' },
      { status: 500 }
    );

  cookies.set(
    LOCALE_COOKIE_NAME,
    locale,
    getTuturuuuSharedCookieOptions(LOCALE_COOKIE_OPTIONS, req)
  );
  return NextResponse.json({ message: 'Success' });
}

export async function DELETE(req: Request) {
  const cookies = await c();

  for (const options of getSharedAndHostOnlyCookieDeleteOptions(
    LOCALE_COOKIE_OPTIONS,
    req
  )) {
    cookies.set(LOCALE_COOKIE_NAME, '', options);
  }
  return NextResponse.json({ message: 'Success' });
}
