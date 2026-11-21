import type { PermissionId } from '@tuturuuu/types/db';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export const POST_EMAIL_SENDING_SECRET = 'ENABLE_EMAIL_SENDING';
export const POST_EMAIL_SEND_PERMISSION: PermissionId =
  'send_user_group_post_emails';

export type PostEmailEnqueueAccess =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'email_sending_disabled' | 'missing_send_permission';
    };

type PermissionChecker = {
  withoutPermission: (permission: PermissionId) => boolean;
};

export async function resolvePostEmailEnqueueAccess({
  permissions,
  wsId,
}: {
  permissions: PermissionChecker;
  wsId: string;
}): Promise<PostEmailEnqueueAccess> {
  if (permissions.withoutPermission(POST_EMAIL_SEND_PERMISSION)) {
    return { allowed: false, reason: 'missing_send_permission' };
  }

  const enabled = await verifySecret({
    forceAdmin: true,
    name: POST_EMAIL_SENDING_SECRET,
    value: 'true',
    wsId,
  });

  if (!enabled) {
    return { allowed: false, reason: 'email_sending_disabled' };
  }

  return { allowed: true };
}
