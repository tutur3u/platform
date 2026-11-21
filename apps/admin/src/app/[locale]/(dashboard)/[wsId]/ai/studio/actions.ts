'use server';

import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const modelIdsSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(100)
  .transform((values) => [...new Set(values)]);

const globalSettingsSchema = z.object({
  defaultModels: modelIdsSchema,
  captureDefaultEnabled: z.boolean(),
  metadataRetentionDays: z.number().int().min(30).max(2555),
  contentRetentionDays: z.number().int().min(1).max(365),
});

const workspacePolicySchema = z.object({
  wsId: z.string().uuid(),
  apiKeyCreationApproved: z.boolean(),
  allowedModels: modelIdsSchema,
  deniedModels: modelIdsSchema,
  captureEnabled: z.boolean().nullable(),
  metadataRetentionDays: z.number().int().min(30).max(2555).nullable(),
  contentRetentionDays: z.number().int().min(1).max(365).nullable(),
  requestsPerMinute: z.number().int().min(1).max(100_000).nullable(),
  monthlyCreditBudget: z.number().min(0.000001).nullable(),
  noTrainingEnforced: z.boolean(),
});

async function requireAiStudioPlatformAdmin() {
  const user = await getSatelliteAppSessionUser('infra');
  if (!user) throw new Error('Unauthorized');

  const permissions = await getPermissions({
    user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (!permissions?.containsPermission('manage_workspace_roles')) {
    throw new Error('Infrastructure administrator permission required');
  }

  return {
    sbAdmin: await createAdminClient({ noCookie: true }),
    user,
  };
}

function revalidateAiStudioSettings(wsId: string) {
  revalidatePath(`/${wsId}/ai/studio`);
}

export async function updateGlobalAiStudioSettingsAction(
  infrastructureWsId: string,
  input: z.input<typeof globalSettingsSchema>
) {
  const values = globalSettingsSchema.parse(input);
  const { sbAdmin, user } = await requireAiStudioPlatformAdmin();
  const { error } = await sbAdmin
    .schema('private')
    .from('ai_studio_global_settings')
    .update({
      capture_default_enabled: values.captureDefaultEnabled,
      content_retention_days: values.contentRetentionDays,
      default_models: values.defaultModels,
      metadata_retention_days: values.metadataRetentionDays,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('singleton', true);

  if (error) {
    console.error('Failed to update AI Studio global settings', {
      code: error.code,
    });
    throw new Error('Unable to update AI Studio global settings');
  }

  revalidateAiStudioSettings(infrastructureWsId);
  return { ok: true as const };
}

export async function updateWorkspaceAiStudioPolicyAction(
  infrastructureWsId: string,
  input: z.input<typeof workspacePolicySchema>
) {
  const values = workspacePolicySchema.parse(input);
  const { sbAdmin, user } = await requireAiStudioPlatformAdmin();
  const { data: current } = await sbAdmin
    .schema('private')
    .from('workspace_ai_studio_policies')
    .select('api_key_creation_approved')
    .eq('ws_id', values.wsId)
    .maybeSingle();
  const approvalChanged =
    (current?.api_key_creation_approved ?? false) !==
    values.apiKeyCreationApproved;
  const { error } = await sbAdmin
    .schema('private')
    .from('workspace_ai_studio_policies')
    .upsert(
      {
        allowed_models: values.allowedModels,
        api_key_creation_approved: values.apiKeyCreationApproved,
        ...(approvalChanged
          ? {
              api_key_creation_decided_at: new Date().toISOString(),
              api_key_creation_decided_by: user.id,
            }
          : {}),
        capture_enabled: values.captureEnabled,
        content_retention_days: values.contentRetentionDays,
        denied_models: values.deniedModels,
        metadata_retention_days: values.metadataRetentionDays,
        monthly_credit_budget: values.monthlyCreditBudget,
        no_training_enforced: values.noTrainingEnforced,
        requests_per_minute: values.requestsPerMinute,
        updated_at: new Date().toISOString(),
        ws_id: values.wsId,
      },
      { onConflict: 'ws_id' }
    );

  if (error) {
    console.error('Failed to update workspace AI Studio policy', {
      code: error.code,
      wsId: values.wsId,
    });
    throw new Error('Unable to update workspace AI Studio policy');
  }

  revalidateAiStudioSettings(infrastructureWsId);
  return { ok: true as const };
}
