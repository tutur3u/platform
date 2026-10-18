import { normalizeStableModelId } from '@tuturuuu/ai/credits/model-mapping';
import { resolvePlanModel } from '@tuturuuu/ai/credits/resolve-plan-model';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';

export const initialAiSettingsSchema = z
  .object({
    creditSource: z.enum(['personal', 'workspace']),
    creditWsId: z.uuid().nullable(),
    modelId: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => value.trim() === value),
    thinkingMode: z.enum(['fast', 'thinking']),
  })
  .strict();
export type InitialAiSettings = z.infer<typeof initialAiSettingsSchema>;

export async function admitInitialAiSettings({
  actorUserId,
  input,
  wsId,
}: {
  actorUserId: string;
  input: InitialAiSettings;
  wsId: string;
}): Promise<
  | { ok: true; settings: InitialAiSettings }
  | { ok: false; status: 403 | 422 | 500; message: string }
> {
  let billingWsId = wsId;
  if (input.creditSource === 'personal') {
    const admin = await createAdminClient({ noCookie: true });
    const { data, error } = await admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', actorUserId)
      .maybeSingle();
    if (error)
      return {
        ok: false,
        status: 500,
        message: 'Credit workspace lookup failed',
      };
    if (!data?.id)
      return {
        ok: false,
        status: 403,
        message: 'Personal credit workspace unavailable',
      };
    billingWsId = data.id;
  }
  if (input.creditWsId !== null && input.creditWsId !== billingWsId) {
    return {
      ok: false,
      status: 403,
      message: 'Invalid credit workspace for selected source',
    };
  }
  const modelId = normalizeStableModelId(input.modelId);
  if (modelId !== input.modelId) {
    return {
      ok: false,
      status: 422,
      message: 'Select the canonical model identifier',
    };
  }
  const resolved = await resolvePlanModel({
    capability: 'language',
    requestedModel: modelId,
    wsId: billingWsId,
  });
  if (resolved.modelId !== modelId || resolved.source !== 'requested') {
    return {
      ok: false,
      status: 422,
      message: 'Selected model is unavailable for selected credits',
    };
  }
  // Null is an explicit stored default scope; billing still uses the bound workspace.
  return { ok: true, settings: { ...input, modelId } };
}

const initialReceiptSchema = initialAiSettingsSchema.extend({
  actorUserId: z.uuid(),
  conversationId: z.uuid(),
  wsId: z.uuid(),
});

export function validateInitialAiSettingsReceipt({
  actorUserId,
  conversationId,
  raw,
  requested,
  wsId,
}: {
  actorUserId: string;
  conversationId: string;
  raw: unknown;
  requested: InitialAiSettings;
  wsId: string;
}) {
  const receipt = initialReceiptSchema.parse(raw);
  if (
    receipt.actorUserId !== actorUserId ||
    receipt.conversationId !== conversationId ||
    receipt.wsId !== wsId ||
    receipt.modelId !== requested.modelId ||
    receipt.creditSource !== requested.creditSource ||
    receipt.creditWsId !== requested.creditWsId ||
    receipt.thinkingMode !== requested.thinkingMode
  ) {
    throw new Error('Invalid initial AI settings receipt');
  }
}
