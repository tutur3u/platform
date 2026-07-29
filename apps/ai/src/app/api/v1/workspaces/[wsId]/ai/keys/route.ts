import { generateAiApiKey } from '@tuturuuu/ai/api-key-hash';
import { connection } from 'next/server';
import { z } from 'zod';
import {
  aiKeyCreationApprovalRequiredResponse,
  authorizeAiStudioWorkspaceRequest,
  getAiKeyCreationApproval,
} from '@/lib/session-api';

const createKeySchema = z.object({
  allowedModels: z.array(z.string().min(1)).max(100).default([]),
  creditBudget: z.number().positive().optional(),
  environment: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  expiresAt: z.string().datetime().optional(),
  name: z.string().trim().min(1).max(120),
  requestsPerMinute: z.number().int().min(1).max(10_000).optional(),
});
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'manage_ai_keys');
  if (!auth.ok) return auth.response;
  const approval = await getAiKeyCreationApproval(
    auth.sbAdmin,
    auth.workspace.id
  );
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const rawCursor = url.searchParams.get('cursor');
  const cursor = parseCursor(rawCursor);
  if (rawCursor && !cursor) {
    return Response.json({ error: 'Invalid API key cursor' }, { status: 400 });
  }

  let query = auth.sbAdmin
    .schema('private')
    .from('ai_studio_api_keys')
    .select(
      'id, name, prefix, environment, allowed_models, expires_at, revoked_at, rotated_to, requests_per_minute, credit_budget, credits_used, last_used_at, created_at'
    )
    .eq('ws_id', auth.workspace.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }
  const { data, error } = await query.limit(limit + 1);

  if (error) {
    return Response.json({ error: 'Keys unavailable' }, { status: 500 });
  }
  const keys = (data ?? []).slice(0, limit);
  const last = keys.at(-1);
  return Response.json(
    {
      approval,
      keys,
      nextCursor:
        (data?.length ?? 0) > limit && last
          ? `${last.created_at}~${last.id}`
          : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'manage_ai_keys');
  if (!auth.ok) return auth.response;
  const approval = await getAiKeyCreationApproval(
    auth.sbAdmin,
    auth.workspace.id
  );
  if (!approval.approved) return aiKeyCreationApprovalRequiredResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON body' }, { status: 400 });
  }
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid key settings' },
      { status: 400 }
    );
  }

  const generated = await generateAiApiKey();
  const { data, error } = await auth.sbAdmin
    .schema('private')
    .from('ai_studio_api_keys')
    .insert({
      allowed_models: parsed.data.allowedModels,
      created_by: auth.user.id,
      credit_budget: parsed.data.creditBudget,
      environment: parsed.data.environment,
      expires_at: parsed.data.expiresAt,
      name: parsed.data.name,
      prefix: generated.prefix,
      requests_per_minute: parsed.data.requestsPerMinute,
      secret_hash: generated.hash,
      ws_id: auth.workspace.id,
    })
    .select(
      'id, name, prefix, environment, allowed_models, expires_at, requests_per_minute, credit_budget, created_at'
    )
    .single();

  if (error || !data) {
    console.error('AI Studio key creation failed', {
      code: error?.code,
      workspaceId: auth.workspace.id,
    });
    return Response.json({ error: 'Key creation failed' }, { status: 500 });
  }

  return Response.json(
    {
      key: data,
      secret: generated.secret,
      warning: 'This secret is shown once and cannot be recovered.',
    },
    { status: 201 }
  );
}

function parseCursor(value: string | null) {
  if (!value) return null;
  const separator = value.lastIndexOf('~');
  if (separator < 1) return null;
  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (Number.isNaN(new Date(createdAt).getTime()) || !UUID_PATTERN.test(id)) {
    return null;
  }
  return { createdAt, id };
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;
}
