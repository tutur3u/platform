import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';
import { getSecret, getSecrets } from '@tuturuuu/utils/workspace-helper';

/** Re-read the current workspace gate immediately before dispatch preparation. */
export async function isTopicAnnouncementSendingEnabled(wsId: string) {
  const secrets = await getSecrets({ forceAdmin: true, wsId });
  return getSecret(TOPIC_ANNOUNCEMENTS_SECRET, secrets ?? [])?.value === 'true';
}

/** Reject the entire intended recipient set; never silently send a subset. */
export function hasUnavailableTopicAnnouncementRecipient(
  rows: Array<{
    contact_id: string;
    contact: { id: string; ws_id: string; archived: boolean } | null;
  }>,
  wsId: string
) {
  return rows.some(
    (row) =>
      !row.contact ||
      row.contact.id !== row.contact_id ||
      row.contact.ws_id !== wsId ||
      row.contact.archived !== false
  );
}
