import { AiStudioError, toOpenAiError } from '@tuturuuu/ai/studio/errors';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { providerInvoiceSchema } from '@/lib/provider-invoice-schema';
import { authenticatePublicAiRequest } from '@/lib/public-credential';

export async function POST(request: Request) {
  try {
    const credential = await authenticatePublicAiRequest(request);
    const appId =
      credential.kind === 'external-app'
        ? credential.appId
        : credential.apiKey.external_app_id?.trim();
    if (
      !appId ||
      request.headers.get('x-tuturuuu-workspace-id')?.toLowerCase() !==
        credential.workspaceId.toLowerCase()
    ) {
      throw new AiStudioError(
        'A workspace-matched external-app credential is required.',
        { code: 'invalid_api_key', status: 403 }
      );
    }
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 8192) {
            await reader.cancel();
            throw new AiStudioError('Payload exceeds 8 KiB.', {
              code: 'invalid_request_error',
              status: 413,
            });
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new AiStudioError('Invalid JSON.', {
        code: 'invalid_request_error',
        status: 400,
      });
    }
    const parsed = providerInvoiceSchema.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.reviewedOn > new Date().toISOString().slice(0, 10)
    ) {
      throw new AiStudioError('Invalid provider invoice snapshot.', {
        code: 'invalid_request_error',
        status: 400,
      });
    }
    const cost = parsed.data;
    const db = await createAdminClient({ noCookie: true });
    const { error } = await db
      .schema('private')
      .rpc('record_external_provider_invoice', {
        p_ws_id: credential.workspaceId,
        p_app_id: appId,
        p_actor_id: credential.actorId,
        p_provider: cost.provider,
        p_account_id: cost.accountId,
        p_reference: cost.reference,
        p_issued_on: cost.issuedOn,
        p_reviewed_on: cost.reviewedOn,
        p_amount_usd: cost.amountUsd,
      });
    if (error?.code === '23505') {
      throw new AiStudioError('Invoice conflicts with a retained receipt.', {
        code: 'invalid_request_error',
        status: 409,
      });
    }
    if (error) {
      console.error('Provider invoice persistence failed', {
        code: error.code,
      });
      throw new AiStudioError(
        'Provider invoices are temporarily unavailable.',
        {
          code: 'server_error',
          status: 503,
        }
      );
    }
    return Response.json(
      { accepted: true, reference: cost.reference },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toOpenAiError(error);
  }
}
