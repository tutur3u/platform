'use server';

import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { createNewsletterClaim } from '@/lib/newsletter/service';

export type NewsletterDnsRow = {
  host: string;
  purpose: string;
  type: string;
  value: string | null;
};

export type NewsletterClaimActionState = {
  approval?: string;
  dkimVerified?: boolean;
  error?: boolean;
  mailFromVerified?: boolean;
  records?: NewsletterDnsRow[];
  status: 'idle' | 'saved' | 'error';
  subdomain?: string;
  token?: string;
  txtVerified?: boolean;
};

export async function createNewsletterClaimAction(
  wsId: string,
  _previous: NewsletterClaimActionState,
  formData: FormData
): Promise<NewsletterClaimActionState> {
  const user = await getCurrentUser();
  if (!user?.id) return { error: true, status: 'error' };
  const permissions = await getPermissions({ wsId });
  if (!permissions?.containsPermission('manage_workspace_settings')) {
    return { error: true, status: 'error' };
  }
  try {
    const created = await createNewsletterClaim({
      actorId: user.id,
      subdomain: String(formData.get('subdomain') ?? ''),
      wsId: permissions.wsId,
    });
    return {
      approval: created.approval,
      dkimVerified: created.dkimVerified,
      mailFromVerified: created.mailFromVerified,
      records: created.dnsRecords,
      status: 'saved',
      subdomain: created.subdomain,
      token: created.token,
      txtVerified: created.txtVerified,
    };
  } catch {
    return { error: true, status: 'error' };
  }
}
