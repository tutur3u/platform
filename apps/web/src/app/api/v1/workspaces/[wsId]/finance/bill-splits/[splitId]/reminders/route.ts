import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { guardApiProxyBody } from '@tuturuuu/utils/api-proxy-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
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
const payload = z.strictObject({ participantId: billSplitId });

export const POST = withSessionAuth<Params>(
  async (request, context, params) => {
    if (process.env.ENABLE_FINANCE_BILL_SPLIT_REMINDERS !== 'true')
      return responseError('Not found', 404);
    const access = await authorize(
      request,
      context,
      params.wsId,
      'create_transactions'
    );
    if (access.response) return access.response;
    const split = billSplitId.safeParse(params.splitId);
    if (!split.success) return responseError('Invalid split', 400);
    if (await guardApiProxyBody(request, 2048))
      return responseError('Invalid reminder', 400);
    const parsed = payload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return responseError('Invalid reminder', 400);
    const store = billSplitStore(
      await createAdminClient({ noCookie: true, auditActorId: access.actorId })
    );
    const { data, error } = await store.rpc(
      'schedule_finance_bill_split_reminder',
      {
        p_ws_id: access.wsId,
        p_actor_id: access.actorId,
        p_split_id: split.data,
        p_participant_id: parsed.data.participantId,
      }
    );
    if (error) return storeError(error.code);
    if (!data) return responseError('Reminder is temporarily unavailable', 503);
    return NextResponse.json({ id: data }, { headers });
  },
  options
);
