import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export async function parseConnectedBody<T extends z.ZodType>(
  request: NextRequest,
  schema: T
): Promise<
  { ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }
> {
  const limit = 20 * 1024 * 1024;
  const failure = (status: number) => ({
    ok: false as const,
    response: NextResponse.json(
      {
        error:
          status === 413
            ? 'Message exceeds request limit'
            : 'Invalid request body',
      },
      { status }
    ),
  });
  if (Number(request.headers.get('Content-Length')) > limit)
    return failure(413);
  const reader = request.body?.getReader();
  if (!reader) return failure(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return failure(413);
      chunks.push(value);
    }
    const result = schema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    );
    return result.success ? { ok: true, data: result.data } : failure(400);
  } catch {
    return failure(400);
  } finally {
    await reader.cancel();
  }
}
