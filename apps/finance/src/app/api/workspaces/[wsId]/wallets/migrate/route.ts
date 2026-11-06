import { NextResponse } from 'next/server';

export async function PUT() {
  // SR-362: this retired migration must never create a client or write wallets.
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message:
          'Infrastructure migration routes are only accessible in development mode',
        hint: 'These routes are intended for internal data migration and should not be used in production.',
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      error: 'MIGRATION_DISABLED',
      message:
        'This workspace migration endpoint is no longer available. Use maintained database migrations or local backfill scripts instead.',
    },
    { status: 410 }
  );
}

async function methodNotAllowed() {
  return NextResponse.json(
    { error: 'method not allowed' },
    { status: 405, headers: { Allow: 'PUT' } }
  );
}

export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const POST = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
