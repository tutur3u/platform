import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;

export function isRootScopedNotification(notification: {
  ws_id?: string | null;
  entity_id?: string | null;
  data?: Record<string, unknown> | null;
}): boolean {
  if (!RESTRICT_TO_ROOT_WORKSPACE_ONLY) return true;
  return (
    (notification.ws_id ??
      notification.entity_id ??
      notification.data?.workspace_id) === ROOT_WORKSPACE_ID
  );
}
