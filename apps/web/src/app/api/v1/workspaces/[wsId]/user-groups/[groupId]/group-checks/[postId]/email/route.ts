import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      message:
        'Direct post email sending has been removed. Emails are now sent by the system queue after approval.',
    },
    { status: 410 }
  );
}
