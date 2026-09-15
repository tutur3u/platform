import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { markMailFolderRead } from '@/lib/mail/repository/folder-read';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';

const schema = z.object({
  folder: z.enum(['inbox', 'archive']),
  cursor: z.string().uuid().optional(),
  before: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ mailboxId: string; wsId: string }>;
  }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, schema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const result = await markMailFolderRead({
      ctx,
      mailboxId,
      payload: body.data,
    });
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  });
}
