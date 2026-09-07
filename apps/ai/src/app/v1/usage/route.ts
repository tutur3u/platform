import { AiStudioError, toOpenAiError } from '@tuturuuu/ai/studio/errors';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection } from 'next/server';
import { authenticatePublicAiRequest } from '@/lib/public-credential';

const DAY = 86_400_000;
const unavailable = () =>
  new AiStudioError('Usage reporting is temporarily unavailable.', {
    code: 'server_error',
    status: 503,
  });

/** Read only the authenticated application's usage, never the entire workspace bill. */
export async function GET(request: Request) {
  await connection();
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
    const db = await createAdminClient({ noCookie: true });
    const first = await db
      .schema('private')
      .from('ai_studio_runs')
      .select('created_at')
      .eq('ws_id', credential.workspaceId)
      .eq('metadata->>external_app_id', appId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (first.error) throw unavailable();
    const to = new Date().toISOString();
    const from = first.data?.created_at ?? to;
    // The canonical RPC accepts at most 366 days. Read adjacent non-overlapping
    // windows so all-time reporting keeps working beyond the first year.
    const rows: {
      day: string;
      model: string;
      feature: string;
      executionMode: string;
      amountUsd: number;
      requests: number;
      failed: number;
      inputTokens: number;
      outputTokens: number;
      billedCredits: number;
      unmeteredCredits: number;
    }[] = [];
    for (
      let start = Date.parse(from);
      start < Date.parse(to);
      start += 365 * DAY
    ) {
      const end = Math.min(start + 365 * DAY, Date.parse(to));
      let complete = false;
      for (let offset = 0; offset < 100_000; offset += 500) {
        const result = await db
          .schema('private')
          .rpc('get_ai_studio_consumption_breakdown', {
            p_ws_id: credential.workspaceId,
            p_user_id: credential.actorId,
            p_from: new Date(start).toISOString(),
            p_to: new Date(end).toISOString(),
          })
          .eq('source_type', 'external_app')
          .eq('source_id', appId)
          .range(offset, offset + 499);
        if (result.error) throw unavailable();
        for (const row of result.data ?? []) {
          // Defense in depth: a changed aggregation must not leak another app.
          if (row.source_type !== 'external_app' || row.source_id !== appId)
            throw unavailable();
          rows.push({
            day: row.bucket_date,
            model: row.model_id,
            feature: row.feature,
            executionMode: row.execution_mode,
            amountUsd: Number(row.provider_cost_usd),
            requests: Number(row.request_count),
            failed: Number(row.failed_count),
            inputTokens: Number(row.input_tokens),
            outputTokens: Number(row.output_tokens),
            billedCredits: Number(row.billed_credits),
            unmeteredCredits: Number(row.unmetered_credits),
          });
        }
        if ((result.data?.length ?? 0) < 500) {
          complete = true;
          break;
        }
      }
      if (!complete) throw unavailable();
    }
    return Response.json(
      {
        currency: 'USD',
        source: 'tuturuuu_ai_metering',
        workspaceId: credential.workspaceId,
        appId,
        from,
        to,
        rows,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toOpenAiError(error);
  }
}
