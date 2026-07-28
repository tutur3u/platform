import { generateAiApiKey } from '@tuturuuu/ai/api-key-hash';
import { connection } from 'next/server';
import { z } from 'zod';
import {
  aiKeyCreationApprovalRequiredResponse,
  authorizeAiStudioWorkspaceRequest,
  getAiKeyCreationApproval,
} from '@/lib/session-api';

const updateKeySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revoke') }),
  z.object({ action: z.literal('rotate') }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ keyId: string; wsId: string }> }
) {
  await connection();
  const { keyId, wsId } = await params;
  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'manage_ai_keys');
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON body' }, { status: 400 });
  }
  const parsed = updateKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid key action' }, { status: 400 });
  }

  const { data: key } = await auth.sbAdmin
    .schema('private')
    .from('ai_studio_api_keys')
    .select('*')
    .eq('id', keyId)
    .eq('ws_id', auth.workspace.id)
    .maybeSingle();
  if (!key) return Response.json({ error: 'Key not found' }, { status: 404 });

  if (parsed.data.action === 'revoke') {
    const { error } = await auth.sbAdmin
      .schema('private')
      .from('ai_studio_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', key.id)
      .eq('ws_id', auth.workspace.id);
    return error
      ? Response.json({ error: 'Revocation failed' }, { status: 500 })
      : Response.json({ revoked: true });
  }

  const approval = await getAiKeyCreationApproval(
    auth.sbAdmin,
    auth.workspace.id
  );
  if (!approval.approved) return aiKeyCreationApprovalRequiredResponse();

  const generated = await generateAiApiKey();
  const { data: replacement, error } = await auth.sbAdmin
    .schema('private')
    .from('ai_studio_api_keys')
    .insert({
      allowed_models: key.allowed_models,
      created_by: auth.user.id,
      credit_budget: key.credit_budget,
      environment: key.environment,
      expires_at: key.expires_at,
      name: `${key.name} (rotated)`,
      prefix: generated.prefix,
      requests_per_minute: key.requests_per_minute,
      secret_hash: generated.hash,
      ws_id: auth.workspace.id,
    })
    .select('id, name, prefix, environment, created_at')
    .single();
  if (error || !replacement) {
    return Response.json({ error: 'Rotation failed' }, { status: 500 });
  }

  const { error: revokeError } = await auth.sbAdmin
    .schema('private')
    .from('ai_studio_api_keys')
    .update({
      revoked_at: new Date().toISOString(),
      rotated_to: replacement.id,
    })
    .eq('id', key.id);

  if (revokeError) {
    await auth.sbAdmin
      .schema('private')
      .from('ai_studio_api_keys')
      .delete()
      .eq('id', replacement.id)
      .eq('ws_id', auth.workspace.id);
    console.error('AI Studio key rotation could not revoke the original key', {
      code: revokeError.code,
      keyId: key.id,
      workspaceId: auth.workspace.id,
    });
    return Response.json({ error: 'Rotation failed' }, { status: 500 });
  }

  return Response.json({
    key: replacement,
    secret: generated.secret,
    warning: 'This secret is shown once and cannot be recovered.',
  });
}
