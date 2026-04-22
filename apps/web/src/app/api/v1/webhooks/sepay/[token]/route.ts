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
import { buildTransactionDescription, markEventFailed } from './event';
import {
  type NormalizedSepayPayload,
  normalizeSepayPayload,
  sepayRawPayloadSchema,
} from './schemas';
import { ensureSystemVirtualUser } from './system-user';
import { classifyTagIds } from './tagger';
import { resolveOrCreateWallet } from './wallet';

interface Params {
  params: Promise<{
    token: string;
  }>;
}

type ExistingSepayWebhookEvent = {
  created_transaction_id: string | null;
  id: string;
  status: 'duplicate' | 'failed' | 'processed' | 'received';
};

async function findExistingWebhookEvent(input: {
  payload: NormalizedSepayPayload;
  sbAdmin: TypedSupabaseClient;
  walletId: string;
  wsId: string;
}) {
  if (input.payload.eventId) {
    const { data, error } = await input.sbAdmin
      .from('sepay_webhook_events')
      .select('id, status, created_transaction_id')
      .eq('ws_id', input.wsId)
      .eq('wallet_id', input.walletId)
      .eq('sepay_event_id', input.payload.eventId)
      .maybeSingle();

    if (error) {
      throw new Error('Failed to lookup SePay event by event id');
    }

    return (data as ExistingSepayWebhookEvent | null) ?? null;
  }

  if (!input.payload.referenceCode) {
    return null;
  }

  const { data, error } = await input.sbAdmin
    .from('sepay_webhook_events')
    .select('id, status, created_transaction_id')
    .eq('ws_id', input.wsId)
    .eq('wallet_id', input.walletId)
    .eq('reference_code', input.payload.referenceCode)
    .eq('transfer_type', input.payload.transferType)
    .eq('transfer_amount', input.payload.transferAmount)
    .eq('transaction_date', input.payload.transactionDate)
    .is('sepay_event_id', null)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to lookup SePay event by fallback key');
  }

  return (data as ExistingSepayWebhookEvent | null) ?? null;
}

async function reuseFailedWebhookEvent(input: {
  endpointId: string;
  existingEventId: string;
  payload: NormalizedSepayPayload;
  sbAdmin: TypedSupabaseClient;
  walletId: string;
  wsId: string;
}) {
  const { data, error } = await input.sbAdmin
    .from('sepay_webhook_events')
    .update({
      created_transaction_id: null,
      endpoint_id: input.endpointId,
      failure_reason: null,
      payload: input.payload.raw as Json,
      processed_at: null,
      received_at: new Date().toISOString(),
      reference_code: input.payload.referenceCode,
      sepay_event_id: input.payload.eventId,
      status: 'received',
      transaction_date: input.payload.transactionDate,
      transfer_amount: input.payload.transferAmount,
      transfer_type: input.payload.transferType,
      wallet_id: input.walletId,
    })
    .eq('id', input.existingEventId)
    .eq('ws_id', input.wsId)
    .select('id')
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error('Failed to reopen failed SePay webhook event');
  }

  return data.id;
}

async function markStoredTransactionProcessed(input: {
  eventId: string;
  sbAdmin: TypedSupabaseClient;
}) {
  const { error } = await input.sbAdmin
    .from('sepay_webhook_events')
    .update({
      failure_reason: null,
      processed_at: new Date().toISOString(),
      status: 'processed',
    })
    .eq('id', input.eventId);

  if (error) {
    console.error(
      'Failed to restore SePay webhook event to processed status:',
      error
    );
  }
}

async function prepareWebhookEvent(input: {
  endpointId: string;
  payload: NormalizedSepayPayload;
  sbAdmin: TypedSupabaseClient;
  walletId: string;
  wsId: string;
}) {
  const existingEvent = await findExistingWebhookEvent(input);

  if (!existingEvent) {
    return { eventId: null, shouldSkip: false as const };
  }

  if (
    existingEvent.status === 'processed' ||
    existingEvent.status === 'duplicate' ||
    existingEvent.status === 'received'
  ) {
    return { eventId: existingEvent.id, shouldSkip: true as const };
  }

  if (existingEvent.created_transaction_id) {
    await markStoredTransactionProcessed({
      eventId: existingEvent.id,
      sbAdmin: input.sbAdmin,
    });

    return { eventId: existingEvent.id, shouldSkip: true as const };
  }

  return {
    eventId: await reuseFailedWebhookEvent({
      endpointId: input.endpointId,
      existingEventId: existingEvent.id,
      payload: input.payload,
      sbAdmin: input.sbAdmin,
      walletId: input.walletId,
      wsId: input.wsId,
    }),
    shouldSkip: false as const,
  };
}

export async function POST(request: Request, { params }: Params) {
  const webhookSecret = getSepayWebhookAuthSecret();
  if (!webhookSecret) {
    console.error('SePay webhook secret is not configured');
  }

  if (
    !webhookSecret ||
    !isValidSepayWebhookAuthorization(request.headers.get('authorization'))
  ) {
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
    console.error(
      'SePay webhook payload normalization failed:',
      normalized.error.issues
    );
    return NextResponse.json(
      { message: 'Invalid SePay webhook fields' },
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

  const { error: lastUsedError } = await sbAdmin
    .from('sepay_webhook_endpoints')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', endpoint.id)
    .eq('ws_id', endpoint.ws_id);

  if (lastUsedError) {
    console.error('Failed to bump SePay endpoint last_used_at:', {
      endpointId: endpoint.id,
      error: lastUsedError,
      wsId: endpoint.ws_id,
    });
  }

  let eventId: string | null = null;

  try {
    const preparedEvent = await prepareWebhookEvent({
      endpointId: endpoint.id,
      payload,
      sbAdmin,
      walletId,
      wsId: endpoint.ws_id,
    });

    if (preparedEvent.shouldSkip) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    eventId = preparedEvent.eventId;
  } catch (error) {
    console.error('Error preparing SePay webhook event:', error);
    return NextResponse.json(
      { message: 'Failed to process webhook event' },
      { status: 500 }
    );
  }

  if (!eventId) {
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
        try {
          const preparedEvent = await prepareWebhookEvent({
            endpointId: endpoint.id,
            payload,
            sbAdmin,
            walletId,
            wsId: endpoint.ws_id,
          });

          if (preparedEvent.shouldSkip) {
            return NextResponse.json({ success: true, duplicate: true });
          }

          eventId = preparedEvent.eventId;
        } catch (error) {
          console.error(
            'Error recovering from SePay webhook event insert race:',
            error
          );
        }
      } else {
        console.error(
          'Error creating SePay webhook event row:',
          insertEventError
        );
      }

      if (!eventId) {
        return NextResponse.json(
          { message: 'Failed to process webhook event' },
          { status: 500 }
        );
      }
    }

    if (!eventId) {
      eventId = eventRow?.id ?? null;
    }
  }

  if (!eventId) {
    return NextResponse.json(
      { message: 'Failed to process webhook event' },
      { status: 500 }
    );
  }

  const persistedEventId = eventId;
  let createdTransactionId: string | null = null;

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

    createdTransactionId = createdTransaction.id;

    // Invariant: once the wallet transaction exists, keep createdTransactionId
    // populated so markEventFailed() can persist it if any later step regresses.

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
      .eq('id', persistedEventId);

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
        createdTransactionId,
        eventId: persistedEventId,
        failureReason,
        sbAdmin,
      });
    } catch (markFailedError) {
      console.error(
        'Failed to persist SePay webhook failure status:',
        markFailedError
      );
    }

    return NextResponse.json(
      { success: false, processed: false },
      { status: 500 }
    );
  }
}
