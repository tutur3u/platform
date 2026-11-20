import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  calculateBillSplit,
  planSettlement,
} from '@tuturuuu/finance-core/bill-splitting';
import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  authorize,
  bodyLimit,
  headers,
  options,
  responseError,
  storeError,
} from './access';
import {
  billSplitId,
  confirmedPayments,
  createBillSplit,
  storedSettlement,
} from './schema';
import { billSplitStore } from './store';

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, context, params) => {
    await connection();
    const access = await authorize(
      request,
      context,
      params.wsId,
      'view_transactions'
    );
    if (access.response) return access.response;

    const rawId = request.nextUrl.searchParams.get('id');
    const id = rawId === null ? undefined : billSplitId.safeParse(rawId);
    if (id && !id.success) return responseError('Invalid split', 400);

    const store = billSplitStore(
      await createAdminClient({ noCookie: true, auditActorId: access.actorId })
    );
    const { data, error } = await store.rpc('read_finance_bill_splits', {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      ...(id ? { p_id: id.data } : {}),
    });
    if (error) return storeError(error.code);
    if (!Array.isArray(data))
      return responseError('Bill split request failed', 500);
    if (id && data.length === 0) return responseError('Not found', 404);
    if (!id) return NextResponse.json({ data }, { headers });

    const split = data[0];
    const stored = storedSettlement.safeParse(split);
    if (
      !stored.success ||
      typeof split !== 'object' ||
      split === null ||
      Array.isArray(split)
    ) {
      return responseError('Bill split request failed', 500);
    }
    const current = await store.rpc('finance_bill_split_confirmed_payments', {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      p_split_id: id.data,
    });
    if (current.error) return storeError(current.error.code);
    const confirmed = confirmedPayments.safeParse(current.data);
    if (!confirmed.success)
      return responseError('Bill split request failed', 500);
    if (confirmed.data.length === 0)
      return NextResponse.json({ data: split }, { headers });

    const settlement = planSettlement({
      balances: stored.data.ledger.balances,
      direct: stored.data.input.direct,
      confirmed: confirmed.data,
    });
    return NextResponse.json(
      {
        data: {
          ...split,
          ledger: {
            ...(typeof split.ledger === 'object' && split.ledger !== null
              ? split.ledger
              : {}),
            settlement,
          },
        },
      },
      { headers }
    );
  },
  options
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, context, params) => {
    const access = await authorize(
      request,
      context,
      params.wsId,
      'create_transactions'
    );
    if (access.response) return access.response;

    const oversized = await guardApiProxyBody(request, bodyLimit);
    if (oversized) return oversized;

    const parsed = createBillSplit.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return responseError('Invalid split', 400);
    const { id, title, currency, participants, expenses, direct, finalized } =
      parsed.data;
    let ledger: ReturnType<typeof calculateBillSplit>;
    try {
      ledger = calculateBillSplit({
        participantIds: participants.map((participant) => participant.id),
        currency,
        expenses,
        direct,
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return responseError(error.message, 400);
    }

    if (request.nextUrl.searchParams.get('preview') === '1') {
      return NextResponse.json({ ledger }, { headers });
    }

    const store = billSplitStore(
      await createAdminClient({ noCookie: true, auditActorId: access.actorId })
    );
    const { data, error } = await store.rpc('create_finance_bill_split', {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      p_id: id,
      p_title: title,
      p_currency: currency.code,
      p_minor_digits: currency.minorDigits,
      p_participants: participants.map((participant) => ({
        id: participant.id,
        display_name: participant.displayName,
        ...(participant.kind === 'member'
          ? { member_id: participant.memberId }
          : { contact_id: participant.contactId }),
      })),
      p_input: { expenses, participants, direct: direct ?? [] },
      p_ledger: ledger,
      p_finalized: finalized,
    });
    if (error) return storeError(error.code);
    if (!data) return responseError('Bill split request failed', 500);
    return NextResponse.json({ id: data, ledger }, { status: 201, headers });
  },
  options
);
