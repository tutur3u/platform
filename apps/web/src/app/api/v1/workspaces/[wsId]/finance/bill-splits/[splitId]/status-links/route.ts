import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { getWorkspaceTier } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  billSplitStatusOrigin,
  createStatusLinkToken,
  digestStatusLinkToken,
} from '@/lib/finance/bill-splits/status-link';
import {
  authorize,
  headers,
  options,
  responseError,
  storeError,
} from '../../access';
import { billSplitId } from '../../schema';
import { billSplitStore } from '../../store';

type Params = { wsId: string; splitId: string };

const command = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('issue'),
    hours: z.int().min(1).max(168),
    participantId: billSplitId.optional(),
    publicName: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[\p{L}\p{M} .'-]+$/u)
      .optional(),
    receivingParticipantId: billSplitId.optional(),
    receivingConsentRevision: billSplitId.optional(),
  }),
  z.strictObject({ kind: z.literal('revoke'), linkId: billSplitId }),
]);

export const GET = withSessionAuth<Params>(async (request, context, params) => {
  await connection();
  if (!billSplitStatusOrigin()) return responseError('Not found', 404);
  const access = await authorize(
    request,
    context,
    params.wsId,
    'create_transactions'
  );
  if (access.response) return access.response;
  const splitId = billSplitId.safeParse(params.splitId);
  if (!splitId.success) return responseError('Invalid split', 400);
  const store = billSplitStore(
    await createAdminClient({ noCookie: true, auditActorId: access.actorId })
  );
  const { data, error } = await store.rpc('list_finance_bill_split_links', {
    p_ws_id: access.wsId,
    p_actor_id: access.actorId,
    p_split_id: splitId.data,
  });
  if (error) return storeError(error.code);
  if (!Array.isArray(data))
    return responseError('Status links are temporarily unavailable', 503);
  return NextResponse.json({ data }, { headers });
}, options);

export const POST = withSessionAuth<Params>(
  async (request, context, params) => {
    const origin = billSplitStatusOrigin();
    if (!origin) return responseError('Not found', 404);
    const access = await authorize(
      request,
      context,
      params.wsId,
      'create_transactions'
    );
    if (access.response) return access.response;
    const splitId = billSplitId.safeParse(params.splitId);
    if (!splitId.success) return responseError('Invalid split', 400);

    const oversized = await guardApiProxyBody(request, 4096);
    if (oversized) return oversized;
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return responseError('Invalid status link request', 400);
    const input = parsed.data;
    if (input.kind === 'issue') {
      if (
        Boolean(input.receivingParticipantId) !==
        Boolean(input.receivingConsentRevision)
      )
        return responseError('Invalid receiving account scope', 400);
      if (
        input.receivingParticipantId &&
        process.env.ENABLE_FINANCE_BILL_SPLIT_CONTACT_BANKS !== 'true'
      ) {
        return responseError('Receiving QR is temporarily unavailable', 503);
      }

      if (input.publicName && !input.participantId)
        return responseError('Invalid status link scope', 400);
      if (
        (await getWorkspaceTier(access.wsId, { useAdmin: true })) === 'FREE'
      ) {
        return responseError('Status links require a paid workspace', 403);
      }
    }

    const token = input.kind === 'issue' ? createStatusLinkToken() : undefined;
    const store = billSplitStore(
      await createAdminClient({ noCookie: true, auditActorId: access.actorId })
    );
    const { data, error } = await store.rpc('manage_finance_bill_split_link', {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      p_split_id: splitId.data,
      ...(input.kind === 'issue' && token
        ? {
            p_digest: digestStatusLinkToken(token),
            p_hours: input.hours,
            p_participant_id: input.participantId,
            p_public_name: input.publicName,
            p_receiving_participant_id: input.receivingParticipantId,
            p_expected_consent_revision: input.receivingConsentRevision,
          }
        : {}),
      ...(input.kind === 'revoke' ? { p_revoke_id: input.linkId } : {}),
    });
    if (error) return storeError(error.code);
    if (!data) return responseError('Not found', 404);
    if (!token)
      return NextResponse.json({ id: data, revoked: true }, { headers });

    const url = new URL('/share/bill-splits', origin);
    url.hash = new URLSearchParams({ token }).toString();
    return NextResponse.json(
      { id: data, url: url.href },
      { status: 201, headers }
    );
  },
  options
);
