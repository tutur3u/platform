import { NextResponse } from 'next/server';
import { z } from 'zod';

export const columnNameBodySchema = z.object({ name: z.string() });

const cellKeySchema = {
  rowId: z.string().min(1),
  columnId: z.string().min(1),
};

export const cellWriteBodySchema = z.object({
  ...cellKeySchema,
  data: z.unknown().optional(),
});

export const cellDeleteBodySchema = z.object(cellKeySchema);

type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/** Reads a JSON request body and validates it; invalid input yields a 400. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParsedBody<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Invalid JSON' }, { status: 400 }),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success)
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      ),
    };
  return { ok: true, data: result.data };
}
