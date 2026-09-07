import { resolveForwardingMailbox } from '../automation/forwarding';
import { mailAutomationSchema, readMailAutomation } from '../automation/policy';
import { mailGroupPolicySchema, readGroupPolicy } from '../groups/policy';
import type {
  MailMailboxSettings,
  MailRouteContext,
  UpdateMailMailboxSettingsPayload,
} from '../types';
import { requireMailboxAccess } from './bootstrap';
import { privateTable } from './shared';

function toSettings(row: Record<string, any>): MailMailboxSettings {
  return {
    automation: row.automation ?? readMailAutomation(row.metadata),
    groupPolicy: row.groupPolicy ?? readGroupPolicy(row.metadata),
    aiInstructions: row.aiInstructions ?? row.ai_instructions ?? '',
    autoDraftEnabled: Boolean(row.autoDraftEnabled ?? row.auto_draft_enabled),
    outboundProviderOverride:
      row.outboundProviderOverride ?? row.outbound_provider_override ?? null,
    senderName: row.senderName ?? row.sender_name ?? '',
    signatureHtml: row.signatureHtml ?? row.signature_html ?? null,
    signatureText: row.signatureText ?? row.signature_text ?? null,
  };
}

export async function getMailboxSettings({
  ctx,
  mailboxId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const settings = toSettings(access.mailbox);
  if (['owner', 'admin'].includes(access.role)) {
    const { data, error } = await privateTable(access.admin, 'mail_events')
      .select('payload')
      .eq('mailbox_id', mailboxId)
      .eq('event_type', 'smart_labels_completed')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const seen = new Set<string>();
    settings.labelSuggestions = (data ?? [])
      .flatMap((event: Record<string, any>) => event.payload?.suggestions ?? [])
      .filter((suggestion: { name: string }) => {
        const key = suggestion.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }
  return settings;
}

export async function updateMailboxSettings({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: UpdateMailMailboxSettingsPayload;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId, ['owner', 'admin']);
  if (!access) return null;

  let groupMetadata: Record<string, unknown> | undefined;
  if (payload.groupPolicy !== undefined) {
    if (access.mailbox.type !== 'shared')
      throw new Error('Groups require a shared address');
    if (payload.groupPolicy === null && access.mailbox.groupPolicy) {
      throw new Error(
        'Distribution groups cannot be converted to shared archives'
      );
    }
    if (payload.groupPolicy && !access.mailbox.groupPolicy) {
      throw new Error(
        'Distribution mode must be provisioned on a new group address'
      );
    }
    groupMetadata = {
      ...access.metadata,
      mail_group: payload.groupPolicy
        ? mailGroupPolicySchema.parse(payload.groupPolicy)
        : undefined,
    };
  }
  if (payload.automation !== undefined) {
    const automation = mailAutomationSchema.parse(payload.automation);
    if (
      access.mailbox.groupPolicy &&
      (automation.forwarding.mode !== 'off' || automation.smartLabelsEnabled)
    )
      throw new Error('Distribution groups already deliver to members');
    const metadata = {
      ...(groupMetadata ?? access.metadata),
      mail_automation: automation,
    };
    if (automation.forwarding.mode !== 'off') {
      const target = await resolveForwardingMailbox(access.admin, {
        id: mailboxId,
        domain_id: access.mailbox.domainId,
        metadata,
      });
      if (!target || !(await requireMailboxAccess(ctx, target.id)))
        throw new Error(
          'Choose an accessible active mailbox in the same domain, other than this mailbox'
        );
    }
    groupMetadata = metadata;
  }
  const patch = {
    ...(groupMetadata ? { metadata: groupMetadata } : {}),
    ...(payload.aiInstructions !== undefined
      ? { ai_instructions: payload.aiInstructions }
      : {}),
    ...(payload.autoDraftEnabled !== undefined
      ? { auto_draft_enabled: payload.autoDraftEnabled }
      : {}),
    ...(payload.outboundProviderOverride !== undefined
      ? { outbound_provider_override: payload.outboundProviderOverride }
      : {}),
    ...(payload.senderName !== undefined && access.mailbox.type === 'shared'
      ? { sender_name: payload.senderName }
      : {}),
    ...(payload.signatureHtml !== undefined
      ? { signature_html: payload.signatureHtml }
      : {}),
    ...(payload.signatureText !== undefined
      ? { signature_text: payload.signatureText }
      : {}),
  };
  if (Object.keys(patch).length === 0) {
    return toSettings(access.mailbox);
  }
  const { data, error } = await privateTable(access.admin, 'mail_mailboxes')
    .update(patch)
    .eq('id', mailboxId)
    .select('*')
    .single();
  if (error)
    throw new Error(`Failed to update mailbox settings: ${error.message}`);
  return {
    ...toSettings(data),
    senderName:
      access.mailbox.type === 'personal'
        ? access.mailbox.senderName
        : (data.sender_name ?? ''),
  };
}
