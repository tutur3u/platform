import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  newsletterErrorResponse,
  newsletterJson,
  readJson,
} from '@/lib/newsletter/http';
import { unsubscribeNewsletter } from '@/lib/newsletter/service';

const bodySchema = z.object({ token: z.string().max(128) }).strict();

export function GET() {
  return NextResponse.json(
    { error: 'method_not_allowed' },
    {
      status: 405,
      headers: { allow: 'POST', 'cache-control': 'no-store' },
    }
  );
}

export async function POST(request: Request) {
  await connection();
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return newsletterJson({ error: 'invalid_token' }, 400);
  try {
    await unsubscribeNewsletter(parsed.data.token);
    return newsletterJson({ ok: true });
  } catch (error) {
    return newsletterErrorResponse(error);
  }
}
