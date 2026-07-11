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
  const { data: mailboxes, error: mailboxError } = await privateSchema
    .from('mail_mailboxes')
    .select('id,address,display_name')
    .eq('domain_id', canonicalDomainId)
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
  await enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID);
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
  const { error } = await (admin as any)
    .schema('private')
    .from('mail_domains')
    .update({
      catch_all_auto_draft_enabled: parsed.data.autoDraftEnabled,
      catch_all_enabled: parsed.data.enabled,
      catch_all_mailbox_id: parsed.data.targetMailboxId,
    })
    .eq('id', domainId);
  if (error) {
    console.error('[mail] failed to update catch-all configuration', { error });
    return NextResponse.json(
      { error: 'Failed to update catch-all configuration' },
      { status: 500 }
    );
  }

  const config = await loadConfiguration(domainId);
  if (!config)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(config);
}
