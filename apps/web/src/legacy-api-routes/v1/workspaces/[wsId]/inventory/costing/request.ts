import { NextResponse } from 'next/server';
import type { z } from 'zod';

export async function parseCostingJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  invalidPayloadMessage: string
): Promise<
  { ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Invalid JSON body' },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: parsed.error.issues, message: invalidPayloadMessage },
        { status: 400 }
      ),
    };
  }

  return { data: parsed.data, ok: true };
}
