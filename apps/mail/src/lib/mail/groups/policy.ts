import { z } from 'zod';

const scope = z.enum(['anyone', 'organization', 'members', 'managers']);
export const mailGroupPolicySchema = z
  .object({
    posting: scope,
    attachments: scope,
    sendAs: z.enum(['members', 'managers']),
    historyEnabled: z.literal(false),
  })
  .strict();
export type MailGroupPolicy = z.infer<typeof mailGroupPolicySchema>;
export const DEFAULT_GROUP_POLICY: MailGroupPolicy = {
  posting: 'organization',
  attachments: 'members',
  sendAs: 'managers',
  historyEnabled: false,
};

export function readGroupPolicy(metadata: unknown): MailGroupPolicy | null {
  if (!metadata || typeof metadata !== 'object' || !('mail_group' in metadata))
    return null;
  // An invalid configured policy must never silently become an unrestricted mailbox.
  return mailGroupPolicySchema.parse(metadata.mail_group);
}

export function permitsGroupScope(
  scope: MailGroupPolicy['posting'],
  actor: { activeInternal: boolean; role?: string | null }
) {
  if (scope === 'anyone') return true;
  if (!actor.activeInternal) return false;
  if (scope === 'organization') return true;
  if (scope === 'members')
    return ['owner', 'admin', 'sender', 'viewer'].includes(actor.role ?? '');
  return actor.role === 'owner' || actor.role === 'admin';
}

export function canSendAsGroup(policy: MailGroupPolicy, role: string) {
  return permitsGroupScope(policy.sendAs, { activeInternal: true, role });
}
