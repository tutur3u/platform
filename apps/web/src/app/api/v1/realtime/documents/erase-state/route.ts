import { verifyRealtimePayload } from '@tuturuuu/realtime/core/token';
import { accountPrivateRpc } from '@tuturuuu/utils/account-benefits-server';
import { z } from 'zod';

const claimsSchema = z
  .object({
    aud: z.literal('tuturuuu.document-erase-callback'),
    kind: z.enum(['generation', 'status', 'admit']),
    namespace: z.literal('CHANNEL_ROOM'),
    topic: z.string(),
    meeting_id: z.guid(),
    document_id: z.guid(),
    nonce: z.guid(),
    exp: z.number().int(),
    key_version: z.literal(1),
    operation_key: z.guid().optional(),
    doc_generation: z.number().int().nonnegative().optional(),
    lease_exp: z.number().int().optional(),
    recovery: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.topic === `meeting-document-${v.meeting_id}`);
export async function POST(request: Request) {
  const raw =
    request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? '';
  if (!process.env.MEET_ERASE_CALLBACK_KEY_V1?.trim())
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  const claims = claimsSchema.safeParse(
    verifyRealtimePayload(raw, process.env.MEET_ERASE_CALLBACK_KEY_V1)
  );
  const headers = { 'Cache-Control': 'no-store' };
  if (
    !claims.success ||
    claims.data.exp * 1000 <= Date.now() ||
    claims.data.exp * 1000 > Date.now() + 31000
  )
    return new Response(null, { status: 401, headers });
  try {
    // The service RPC consumes the nonce durably before returning any state and
    // binds every lookup and apply lease to this namespace, meeting and document.
    const state = await accountPrivateRpc<unknown>(
      'meet_document_erase_callback',
      { p_claims: claims.data }
    );
    return Response.json(state, { headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
