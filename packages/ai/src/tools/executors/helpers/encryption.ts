/**
 * Shared encryption/decryption helpers for AI tool executors.
 *
 * Uses dynamic imports to avoid pulling server-only modules into the
 * `packages/ai` dependency graph at build time. This mirrors the pattern
 * used by the image generation tool for `createAdminClient`.
 */

type CalendarEventRow = {
  id: string;
  title: string;
  description?: string;
  location?: string | null;
  is_encrypted?: boolean;
  [key: string]: unknown;
};

/**
 * Retrieve the workspace encryption key (read-only).
 * Strict mode throws on key/configuration failures; null means no workspace key.
 */
export async function getWorkspaceKeyForTools(
  wsId: string,
  strict = false
): Promise<Buffer | null> {
  try {
    const { isEncryptionEnabled, getMasterKey, decryptWorkspaceKey } =
      await import('@tuturuuu/utils/encryption');

    if (!strict && !isEncryptionEnabled()) return null;

    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('workspace_encryption_keys')
      .select('encrypted_key')
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return await decryptWorkspaceKey(
      (data as { encrypted_key: string }).encrypted_key,
      getMasterKey()
    );
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

/**
 * Decrypt an array of calendar events in-place if any are encrypted.
 */
export async function decryptEventsForTools<T extends CalendarEventRow>(
  events: T[],
  wsId: string
): Promise<T[]> {
  const hasEncrypted = events.some((e) => e.is_encrypted);
  if (!hasEncrypted) return events;

  const key = await getWorkspaceKeyForTools(wsId);
  if (!key) return events;

  const { decryptCalendarEvents } = await import('@tuturuuu/utils/encryption');
  return decryptCalendarEvents(events, key);
}

/**
 * Encrypt the sensitive fields of a calendar event before storage.
 * Returns the original data untouched when E2EE is not enabled.
 */
export async function encryptEventFieldsForTools(
  fields: { title: string; description: string; location: string | null },
  wsId: string,
  strict = false
): Promise<{
  title: string;
  description: string;
  location: string | null;
  is_encrypted: boolean;
}> {
  const key = await getWorkspaceKeyForTools(wsId, strict);
  if (!key) {
    return { ...fields, is_encrypted: false };
  }

  const { encryptCalendarEventFields } = await import(
    '@tuturuuu/utils/encryption'
  );
  const encrypted = encryptCalendarEventFields(
    {
      title: fields.title,
      description: fields.description,
      location: fields.location ?? undefined,
    },
    key
  );

  return {
    title: encrypted.title,
    description: encrypted.description,
    location: encrypted.location ?? null,
    is_encrypted: true,
  };
}
