import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { validPaymentProof } from '@/lib/finance/bill-splits/payment-proof';
import { publishBillSplitActivity } from '@/lib/finance/bill-splits/realtime';
import {
  authorize,
  headers,
  options,
  responseError,
  storeError,
} from '../../access';
import { billSplitActivity, billSplitId } from '../../schema';
import { billSplitStore } from '../../store';

type Params = { wsId: string; splitId: string };
const activityBodyLimit = 368640;

export const GET = withSessionAuth<Params>(async (request, context, params) => {
  await connection();
  const access = await authorize(
    request,
    context,
    params.wsId,
    'view_transactions'
  );
  if (access.response) return access.response;
  const splitId = billSplitId.safeParse(params.splitId);
  if (!splitId.success) return responseError('Invalid split', 400);

  const store = billSplitStore(
    await createAdminClient({ noCookie: true, auditActorId: access.actorId })
  );
  const { data, error } = await store.rpc('read_finance_bill_split_activity', {
    p_ws_id: access.wsId,
    p_actor_id: access.actorId,
    p_split_id: splitId.data,
  });
  if (error) return storeError(error.code);
  if (!Array.isArray(data))
    return responseError('Bill split activity request failed', 500);
  return NextResponse.json({ data }, { headers });
}, options);

export const POST = withSessionAuth<Params>(
  async (request, context, params) => {
    const access = await authorize(
      request,
      context,
      params.wsId,
      'view_transactions'
    );
    if (access.response) return access.response;
    const splitId = billSplitId.safeParse(params.splitId);
    if (!splitId.success) return responseError('Invalid split', 400);

    const oversized = await guardApiProxyBody(request, activityBodyLimit);
    if (oversized) return oversized;
    const event = billSplitActivity.safeParse(
      await request.json().catch(() => null)
    );
    if (!event.success) return responseError('Invalid activity', 400);
    const item = event.data;
    if (
      item.kind === 'payment_report' &&
      item.proof &&
      !validPaymentProof(item.proof)
    ) {
      return responseError('Invalid payment proof', 400);
    }
    const store = billSplitStore(
      await createAdminClient({ noCookie: true, auditActorId: access.actorId })
    );
    const scope = {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      p_split_id: splitId.data,
      p_event_id: item.eventId,
    };
    const { data, error } =
      item.kind === 'payment_report' && item.proof
        ? await store.rpc('report_finance_bill_split_with_proof', {
            ...scope,
            p_from_id: item.from,
            p_to_id: item.to,
            p_amount_minor: item.amountMinor,
            p_content_type: item.proof.contentType,
            p_proof_base64: item.proof.base64,
          })
        : await store.rpc('write_finance_bill_split_activity', {
            p_ws_id: access.wsId,
            p_actor_id: access.actorId,
            p_split_id: splitId.data,
            p_event_id: item.eventId,
            p_kind: item.kind,
            ...(item.kind === 'comment' ? { p_comment: item.comment } : {}),
            ...(item.kind === 'payment_report'
              ? {
                  p_from_id: item.from,
                  p_to_id: item.to,
                  p_amount_minor: item.amountMinor,
                }
              : {}),
            ...(item.kind === 'payment_confirm'
              ? { p_report_id: item.reportId }
              : {}),
          });
    if (error) return storeError(error.code);
    if (!data) return responseError('Bill split activity request failed', 500);
    await publishBillSplitActivity(access.wsId, splitId.data, data);
    return NextResponse.json({ id: data }, { headers });
  },
  { ...options, maxPayloadSize: activityBodyLimit }
);
