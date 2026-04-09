import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  getSepayWebhookAuthSecret,
  isValidSepayWebhookAuthorization,
} from '@/lib/sepay';
import { classifyCategoryId } from './classifier';
import { resolveEndpointByToken } from './endpoint';
import { classifyTagIds } from './tagger';
import { buildTransactionDescription, markEventFailed } from './event';
import { normalizeSepayPayload, sepayRawPayloadSchema } from './schemas';
import { ensureSystemVirtualUser } from './system-user';
import { resolveOrCreateWallet } from './wallet';

interface Params {
  params: Promise<{
    token: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const webhookSecret = getSepayWebhookAuthSecret();
  if (!webhookSecret) {
    return NextResponse.json(
      { message: 'SePay webhook secret is not configured' },
      { status: 500 }
    );
  }

  if (!isValidSepayWebhookAuthorization(request.headers.get('authorization'))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { token } = await params;
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;

  const endpointResolution = await resolveEndpointByToken({ sbAdmin, token });
  if (endpointResolution.error) {
    console.error(
      'Error resolving SePay endpoint token:',
      endpointResolution.error
    );
    return NextResponse.json(
      { message: 'Failed to resolve webhook endpoint' },
      { status: 500 }
    );
  }

  if (!endpointResolution.endpoint) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const endpoint = endpointResolution.endpoint;

  const ipAddress = extractIPFromHeaders(request.headers);
  const rateLimitResult = await checkRateLimit(
    `sepay:webhook:${endpoint.id}:${ipAddress}`,
    { maxRequests: 120, windowMs: 60_000 }
  );

  if (!('allowed' in rateLimitResult)) {
    return rateLimitResult;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedRaw = sepayRawPayloadSchema.safeParse(rawBody);
  if (!parsedRaw.success) {
    return NextResponse.json(
      { message: 'Invalid webhook payload' },
      { status: 400 }
    );
  }

  const normalized = normalizeSepayPayload(
    parsedRaw.data as Record<string, unknown>
  );

  if (!normalized.success) {
    return NextResponse.json(
      {
        message: 'Invalid SePay webhook fields',
        errors: normalized.error.issues,
      },
      { status: 400 }
    );
  }

  const payload = normalized.data;

  let walletId: string;
  try {
    walletId = await resolveOrCreateWallet({
      endpointWalletId: endpoint.wallet_id,
      payload,
      sbAdmin,
      wsId: endpoint.ws_id,
    });
  } catch (error) {
    console.error('Error resolving SePay wallet:', error);
    return NextResponse.json(
      { message: 'Failed to resolve wallet' },
      { status: 500 }
    );
  }

  await sbAdmin
    .from('sepay_webhook_endpoints')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', endpoint.id)
    .eq('ws_id', endpoint.ws_id);

  const existingEventQuery = payload.eventId
    ? sbAdmin
        .from('sepay_webhook_events')
        .select('id')
        .eq('ws_id', endpoint.ws_id)
        .eq('wallet_id', walletId)
        .eq('sepay_event_id', payload.eventId)
        .limit(1)
    : null;

  if (existingEventQuery) {
    const { data: existingEvents, error: existingEventError } =
      await existingEventQuery;

    if (existingEventError) {
      console.error(
        'Error checking duplicate SePay event:',
        existingEventError
      );
      return NextResponse.json(
        { message: 'Failed to process webhook event' },
        { status: 500 }
      );
    }

    if ((existingEvents ?? []).length > 0) {
      return NextResponse.json({ success: true, duplicate: true });
    }
  }

  const { data: eventRow, error: insertEventError } = await sbAdmin
    .from('sepay_webhook_events')
    .insert([
      {
        endpoint_id: endpoint.id,
        payload: payload.raw as Json,
        reference_code: payload.referenceCode,
        sepay_event_id: payload.eventId,
        status: 'received',
        transaction_date: payload.transactionDate,
        transfer_amount: payload.transferAmount,
        transfer_type: payload.transferType,
        wallet_id: walletId,
        ws_id: endpoint.ws_id,
      },
    ])
    .select('id')
    .single();

  if (insertEventError) {
    if (insertEventError.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true });
    }

    console.error('Error creating SePay webhook event row:', insertEventError);
    return NextResponse.json(
      { message: 'Failed to process webhook event' },
      { status: 500 }
    );
  }

  if (!eventRow?.id) {
    return NextResponse.json(
      { message: 'Failed to process webhook event' },
      { status: 500 }
    );
  }

  try {
    const classification = await classifyCategoryId({
      isExpense: payload.transferType === 'out',
      payload,
      sbAdmin,
      wsId: endpoint.ws_id,
    });

    const tagClassification = await classifyTagIds({
      payload,
      sbAdmin,
      wsId: endpoint.ws_id,
    });

    const creatorId = await ensureSystemVirtualUser({
      sbAdmin,
      wsId: endpoint.ws_id,
    });

    const transactionAmount =
      payload.transferType === 'out'
        ? -payload.transferAmount
        : payload.transferAmount;

    const { data: createdTransaction, error: createTransactionError } =
      await sbAdmin
        .from('wallet_transactions')
        .insert([
          {
            amount: transactionAmount,
            category_id: classification.categoryId,
            creator_id: creatorId,
            description: buildTransactionDescription({
              code: payload.code,
              content: payload.content,
              description: payload.description,
              referenceCode: payload.referenceCode,
              transferType: payload.transferType,
            }),
            report_opt_in: true,
            taken_at: payload.transactionDate,
            wallet_id: walletId,
          },
        ])
        .select('id')
        .single();

    if (createTransactionError || !createdTransaction?.id) {
      throw new Error('Failed to create wallet transaction from webhook');
    }

    // Insert transaction tags if any were classified
    if (tagClassification.tagIds.length > 0) {
      const tagInserts = tagClassification.tagIds.map((tagId) => ({
        tag_id: tagId,
        transaction_id: createdTransaction.id,
      }));

      const { error: tagInsertError } = await sbAdmin
        .from('wallet_transaction_tags')
        .insert(tagInserts);

      if (tagInsertError) {
        console.error(
          'Failed to insert transaction tags for webhook transaction:',
          tagInsertError
        );
        // Don't throw - the transaction is already created, tags are non-critical
      }
    }

    const { error: finalizeEventError } = await sbAdmin
      .from('sepay_webhook_events')
      .update({
        created_transaction_id: createdTransaction.id,
        failure_reason: null,
        processed_at: new Date().toISOString(),
        status: 'processed',
      })
      .eq('id', eventRow.id);

    if (finalizeEventError) {
      throw new Error('Failed to update webhook event as processed');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const failureReason =
      error instanceof Error ? error.message : 'Unknown processing failure';

    console.error('Failed to process SePay webhook event:', error);
    try {
      await markEventFailed({
        eventId: eventRow.id,
        failureReason,
        sbAdmin,
      });
    } catch (markFailedError) {
      console.error(
        'Failed to persist SePay webhook failure status:',
        markFailedError
      );
    }

    return NextResponse.json({ success: true, processed: false });
  }
}
