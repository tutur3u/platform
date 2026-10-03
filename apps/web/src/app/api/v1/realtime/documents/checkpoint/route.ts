import { createHash } from 'node:crypto';
import { channelTicketSchema } from '@tuturuuu/realtime/channels';
import { verifyRealtimePayload } from '@tuturuuu/realtime/core/token';
import { richTextDocumentContent } from '@tuturuuu/realtime/documents/server';
import { accountPrivateRpc } from '@tuturuuu/utils/account-benefits-server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { noStore } from '../../route-utils';

const bodySchema = z
  .object({
    state: z.array(z.number().int().min(0).max(255)).max(524288),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function POST(request: Request) {
  const raw = request.headers
    .get('Authorization')
    ?.match(/^Bearer (\S+)$/)?.[1];
  const ticket = channelTicketSchema.safeParse(
    verifyRealtimePayload(raw ?? '', process.env.MEET_REALTIME_TOKEN_SECRET)
  );
  if (
    !ticket.success ||
    ticket.data.kind !== 'document-checkpoint' ||
    ticket.data.exp * 1000 <= Date.now() ||
    !ticket.data.ownerId ||
    !ticket.data.documentId ||
    ticket.data.version === undefined ||
    !/^meeting-document-[a-f0-9-]{36}$/.test(ticket.data.topic)
  )
    return new NextResponse(null, { status: 401, headers: noStore });
  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400, headers: noStore });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 3_000_000) {
        await reader.cancel();
        return new NextResponse(null, { status: 413, headers: noStore });
      }
      chunks.push(value);
    }
    const body = bodySchema.parse(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    );
    const bytes = Uint8Array.from(body.state);
    if (createHash('sha256').update(bytes).digest('hex') !== body.hash)
      return new NextResponse(null, { status: 400, headers: noStore });
    const revision = await accountPrivateRpc<number>(
      'checkpoint_meeting_document',
      {
        p_meeting_id: ticket.data.topic.slice('meeting-document-'.length),
        p_document_id: ticket.data.documentId,
        p_owner_id: ticket.data.ownerId,
        p_state: body.state,
        p_content: richTextDocumentContent(bytes),
        p_hash: body.hash,
        p_version: ticket.data.version,
      }
    );
    return NextResponse.json({ revision }, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { error: 'Document checkpoint failed' },
      {
        status:
          error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 503,
        headers: noStore,
      }
    );
  }
}
