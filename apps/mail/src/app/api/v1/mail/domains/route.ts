import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const providerSchema = z.enum(['cloudflare', 'ses']);
const domainConfigSchema = z.object({
  cloudflareAccountId: z.string().trim().max(64).nullable().optional(),
  cloudflareRoutingRuleId: z.string().trim().max(64).nullable().optional(),
  cloudflareZoneId: z.string().trim().max(64).nullable().optional(),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u
    ),
  inboundProvider: providerSchema,
  outboundProvider: providerSchema,
  status: z.enum(['active', 'disabled', 'pending', 'quarantined', 'verifying']),
  verificationState: z.record(z.string(), z.unknown()).optional(),
});

function toDomain(row: Record<string, any>) {
  return {
    cloudflareAccountId: row.cloudflare_account_id ?? null,
    cloudflareRoutingRuleId: row.cloudflare_routing_rule_id ?? null,
    cloudflareZoneId: row.cloudflare_zone_id ?? null,
    domain: row.domain,
    id: row.id,
    inboundProvider: row.inbound_provider,
    outboundProvider: row.outbound_provider,
    status: row.status,
    verificationState: row.verification_state ?? {},
    verifiedAt: row.verified_at ?? null,
  };
}

export async function GET() {
  await enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID);
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await (admin as any)
    .schema('private')
    .from('mail_domains')
    .select('*')
    .order('domain');
  if (error) {
    console.error('[mail] failed to list mail domains', { error });
    return NextResponse.json(
      { error: 'Failed to list mail domains' },
      { status: 500 }
    );
  }
  return NextResponse.json({
    domains: ((data ?? []) as Record<string, any>[]).map(toDomain),
  });
}

export async function PUT(request: Request) {
  await enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID);
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = domainConfigSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid mail domain configuration' },
      { status: 400 }
    );
  }

  const admin = await createAdminClient({ noCookie: true });
  const config = parsed.data;
  const { data, error } = await (admin as any)
    .schema('private')
    .from('mail_domains')
    .upsert(
      {
        cloudflare_account_id: config.cloudflareAccountId,
        cloudflare_routing_rule_id: config.cloudflareRoutingRuleId,
        cloudflare_zone_id: config.cloudflareZoneId,
        domain: config.domain,
        inbound_provider: config.inboundProvider,
        outbound_provider: config.outboundProvider,
        status: config.status,
        verification_state: config.verificationState ?? {},
        verified_at:
          config.status === 'active' ? new Date().toISOString() : null,
      },
      { onConflict: 'domain' }
    )
    .select('*')
    .single();
  if (error) {
    console.error('[mail] failed to update mail domain', { error });
    return NextResponse.json(
      { error: 'Failed to update mail domain' },
      { status: 500 }
    );
  }
  return NextResponse.json({ domain: toDomain(data) });
}
