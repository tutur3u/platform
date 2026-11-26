import { safeErrorFields } from '@/lib/mail/log-safety';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const payloadSchema = z.object({
  autoDraftEnabled: z.boolean(),
  enabled: z.boolean(),
  targetMailboxId: z.string().uuid().nullable(),
});

type RouteContext = { params: Promise<{ domainId: string }> };

function toDomain(row: Record<string, any>) {
  return {
    canonicalDomainId: row.canonical_domain_id ?? null,
    catchAllAutoDraftEnabled: Boolean(row.catch_all_auto_draft_enabled),
    catchAllEnabled: Boolean(row.catch_all_enabled),
    catchAllMailboxId: row.catch_all_mailbox_id ?? null,
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

async function loadConfiguration(domainId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const privateSchema = (admin as any).schema('private');
  const { data: domain, error } = await privateSchema
    .from('mail_domains')
    .select('*')
    .eq('id', domainId)
    .maybeSingle();
  if (error) throw error;
  if (!domain) return null;

  const canonicalDomainId = domain.canonical_domain_id ?? domain.id;
  const allowedDomainIds = domain.catch_all_domain_id
    ? [canonicalDomainId, domain.catch_all_domain_id]
    : [canonicalDomainId];
  const { data: mailboxes, error: mailboxError } = await privateSchema
    .from('mail_mailboxes')
    .select('id,address,display_name')
    .in('domain_id', allowedDomainIds)
    .eq('status', 'active')
    .order('address');
  if (mailboxError) throw mailboxError;

  return {
    autoDraftEnabled: Boolean(domain.catch_all_auto_draft_enabled),
    domain: toDomain(domain),
    eligibleMailboxes: (mailboxes ?? []).map(
      (mailbox: Record<string, any>) => ({
        address: mailbox.address,
        displayName: mailbox.display_name || mailbox.address,
        id: mailbox.id,
      })
    ),
    enabled: Boolean(domain.catch_all_enabled),
    providerActive:
      typeof domain.verification_state?.catch_all_active === 'boolean'
        ? domain.verification_state.catch_all_active
        : null,
    targetMailboxId: domain.catch_all_mailbox_id ?? null,
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  await enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID);
  const { domainId } = await params;
  const config = await loadConfiguration(domainId);
  if (!config)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(config);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const actor = await enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID);
  const { domainId } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (
    !parsed.success ||
    (parsed.data.enabled && !parsed.data.targetMailboxId) ||
    (parsed.data.autoDraftEnabled && !parsed.data.enabled)
  ) {
    return NextResponse.json(
      { error: 'Invalid catch-all configuration' },
      { status: 400 }
    );
  }

  const admin = await createAdminClient({ noCookie: true });
  const { data: updated, error } = await (admin as any)
    .schema('private')
    .rpc('set_mail_domain_catch_all', {
      p_actor_id: actor.id,
      p_domain_id: domainId,
      p_enabled: parsed.data.enabled,
      p_target_mailbox_id: parsed.data.targetMailboxId,
      p_auto_draft_enabled: parsed.data.autoDraftEnabled,
    });
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error.code === '23514') {
      return NextResponse.json(
        { error: 'Invalid catch-all configuration' },
        { status: 400 }
      );
    }
    console.error('[mail] failed to update catch-all configuration', {
      error: safeErrorFields(error),
    });
    return NextResponse.json(
      { error: 'Failed to update catch-all configuration' },
      { status: 500 }
    );
  }

  if (!updated)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config = await loadConfiguration(domainId);
  if (!config)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(config);
}
