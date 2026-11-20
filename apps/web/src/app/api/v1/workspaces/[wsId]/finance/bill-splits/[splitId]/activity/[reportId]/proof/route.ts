import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { proofImageType } from '@/lib/finance/bill-splits/payment-proof';
import {
  authorize,
  headers,
  options,
  responseError,
  storeError,
} from '../../../../access';
import { billSplitId } from '../../../../schema';
import { billSplitStore } from '../../../../store';

type Params = { wsId: string; splitId: string; reportId: string };
const response = z.object({ contentType: proofImageType, base64: z.string() });
const ext = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export const GET = withSessionAuth<Params>(async (request, context, params) => {
  await connection();
  const access = await authorize(
    request,
    context,
    params.wsId,
    'view_transactions'
  );
  if (access.response) return access.response;
  const splits = billSplitId.safeParse(params.splitId);
  const report = billSplitId.safeParse(params.reportId);
  if (!splits.success || !report.success)
    return responseError('Not found', 404);
  const store = billSplitStore(
    await createAdminClient({ noCookie: true, auditActorId: access.actorId })
  );
  const { data, error } = await store.rpc('read_finance_bill_split_proof', {
    p_ws_id: access.wsId,
    p_actor_id: access.actorId,
    p_split_id: splits.data,
    p_report_id: report.data,
  });
  if (error) return storeError(error.code);
  const proof = response.safeParse(data);
  if (!proof.success) return responseError('Not found', 404);
  const contents = Uint8Array.from(Buffer.from(proof.data.base64, 'base64'));
  return new NextResponse(contents, {
    headers: {
      ...headers,
      'Content-Type': proof.data.contentType,
      'Content-Disposition': `attachment; filename="payment-proof.${ext[proof.data.contentType]}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  });
}, options);
