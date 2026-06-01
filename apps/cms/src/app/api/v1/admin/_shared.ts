import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CmsExternalProjectAdminError } from '@/lib/external-projects/admin-store';

export async function readJsonBody(request: Request) {
  try {
    return {
      ok: true as const,
      body: await request.json(),
    };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Malformed JSON payload' },
        { status: 400 }
      ),
    };
  }
}

export function adminRouteErrorResponse(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Invalid payload', details: error.flatten() },
      { status: 400 }
    );
  }

  if (error instanceof CmsExternalProjectAdminError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json({ error: fallback }, { status: 500 });
}
