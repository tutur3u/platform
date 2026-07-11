import type {
  MailMailboxSettings,
  MailRouteContext,
  UpdateMailMailboxSettingsPayload,
} from '../types';
import { requireMailboxAccess } from './bootstrap';
import { privateTable } from './shared';

function toSettings(row: Record<string, any>): MailMailboxSettings {
  return {
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
  return toSettings(access.mailbox);
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

  const patch = {
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
