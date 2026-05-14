import { NextResponse } from 'next/server';

export function PATCH() {
  return NextResponse.json(
    { message: 'Email changes are handled by central Tuturuuu account auth.' },
    { status: 410 }
  );
}
