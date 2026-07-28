import { connection } from 'next/server';
import { z } from 'zod';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

const policySchema = z.object({
  allowedModels: z.array(z.string()).max(100).default([]),
  captureEnabled: z.boolean().nullable().default(null),
  contentRetentionDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .nullable()
    .default(null),
  deniedModels: z.array(z.string()).max(100).default([]),
  metadataRetentionDays: z
    .number()
    .int()
    .min(30)
    .max(2_555)
    .nullable()
    .default(null),
  monthlyCreditBudget: z.number().positive().nullable().default(null),
  noTrainingEnforced: z.boolean().default(true),
  requestsPerMinute: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .nullable()
    .default(null),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'use_ai_studio');
  if (!auth.ok) return auth.response;

  const [{ data: global }, { data: policy }] = await Promise.all([
    auth.sbAdmin
      .schema('private')
      .from('ai_studio_global_settings')
      .select('*')
      .eq('singleton', true)
      .maybeSingle(),
    auth.sbAdmin
      .schema('private')
      .from('workspace_ai_studio_policies')
      .select('*')
      .eq('ws_id', auth.workspace.id)
      .maybeSingle(),
  ]);
  return Response.json({ global, policy });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const auth = await authorizeAiStudioWorkspaceRequest(
    wsId,
    'manage_ai_policy'
  );
  if (!auth.ok) return auth.response;

  const parsed = policySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid policy' },
      { status: 400 }
    );
  }

  const { data, error } = await auth.sbAdmin
    .schema('private')
    .from('workspace_ai_studio_policies')
    .upsert({
      allowed_models: parsed.data.allowedModels,
      capture_enabled: parsed.data.captureEnabled,
      content_retention_days: parsed.data.contentRetentionDays,
      created_by: auth.user.id,
      denied_models: parsed.data.deniedModels,
      metadata_retention_days: parsed.data.metadataRetentionDays,
      monthly_credit_budget: parsed.data.monthlyCreditBudget,
      no_training_enforced: parsed.data.noTrainingEnforced,
      requests_per_minute: parsed.data.requestsPerMinute,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
      ws_id: auth.workspace.id,
    })
    .select('*')
    .single();

  return error
    ? Response.json({ error: 'Policy update failed' }, { status: 500 })
    : Response.json({ policy: data });
}
