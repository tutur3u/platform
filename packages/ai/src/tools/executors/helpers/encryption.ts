/**
 * Shared encryption/decryption helpers for AI tool executors.
 *
 * Uses dynamic imports to avoid pulling server-only modules into the
 * `packages/ai` dependency graph at build time. This mirrors the pattern
 * used by the image generation tool for `createAdminClient`.
 *
 * A workspace with a `workspace_encryption_keys` row is end-to-end encrypted
 * whether or not this server can unwrap its key. When the key cannot be
 * unwrapped (missing master key, failed lookup or failed decryption), tools
 * fail closed: writes are refused and encrypted fields are withheld from
 * reads, so an encrypted workspace never receives plaintext writes and tools
 * never surface ciphertext.
 */

type CalendarEventRow = {
  id: string;
  title: string;
  description?: string;
  location?: string | null;
  is_encrypted?: boolean;
  [key: string]: unknown;
};

export type WithheldEventRow<T> = T & { encryption_unavailable?: true };

export type WorkspaceKeyState =
  | { status: 'none' }
  | { status: 'available'; key: Buffer }
  | { status: 'unavailable'; cause: unknown };

export const ENCRYPTION_UNAVAILABLE_MESSAGE =
  'This workspace uses end-to-end encryption, but encryption is unavailable on this server right now. No event changes were saved.';

export class WorkspaceEncryptionUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(ENCRYPTION_UNAVAILABLE_MESSAGE, options);
    this.name = 'WorkspaceEncryptionUnavailableError';
  }
}

export function isWorkspaceEncryptionUnavailableError(
  error: unknown
): error is WorkspaceEncryptionUnavailableError {
  return error instanceof WorkspaceEncryptionUnavailableError;
}

/**
 * Resolve the workspace encryption state (read-only).
 * The key row is checked independently of the master key, so a workspace
 * with a key row is never reported as unencrypted.
 */
export async function resolveWorkspaceKeyForTools(
  wsId: string
): Promise<WorkspaceKeyState> {
  let encryptedKey: string;
  try {
    const { createAdminClient } =
      await import('@tuturuuu/supabase/next/server');
    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('workspace_encryption_keys')
      .select('encrypted_key')
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { status: 'none' };
    encryptedKey = (data as { encrypted_key: string }).encrypted_key;
  } catch (cause) {
    return { status: 'unavailable', cause };
  }

  try {
    const { getMasterKey, decryptWorkspaceKey } =
      await import('@tuturuuu/utils/encryption');
    const key = await decryptWorkspaceKey(encryptedKey, getMasterKey());
    return { status: 'available', key };
  } catch (cause) {
    return { status: 'unavailable', cause };
  }
}

/**
 * Retrieve the workspace encryption key (read-only).
 * Null means the workspace has no key row. When a key row exists but cannot
 * be unwrapped, strict mode rethrows the underlying failure and non-strict
 * mode throws `WorkspaceEncryptionUnavailableError`.
 */
export async function getWorkspaceKeyForTools(
  wsId: string,
  strict = false
): Promise<Buffer | null> {
  const state = await resolveWorkspaceKeyForTools(wsId);
  if (state.status === 'none') return null;
  if (state.status === 'available') return state.key;
  if (strict) throw state.cause;
  throw new WorkspaceEncryptionUnavailableError({ cause: state.cause });
}

/**
 * Decrypt an array of calendar events if any are encrypted.
 * Encrypted events that cannot be decrypted keep their metadata but have
 * title, description and location withheld and `encryption_unavailable` set.
 */
export async function decryptEventsForTools<T extends CalendarEventRow>(
  events: T[],
  wsId: string
): Promise<Array<WithheldEventRow<T>>> {
  const hasEncrypted = events.some((e) => e.is_encrypted);
  if (!hasEncrypted) return events as Array<WithheldEventRow<T>>;

  const state = await resolveWorkspaceKeyForTools(wsId);
  if (state.status !== 'available') {
    const withheld = events.map((event) => {
      if (!event.is_encrypted) return event;
      return {
        ...event,
        title: '',
        ...('description' in event ? { description: '' } : {}),
        ...('location' in event ? { location: null } : {}),
        encryption_unavailable: true as const,
      };
    });
    return withheld as Array<WithheldEventRow<T>>;
  }

  const { decryptCalendarEvents } = await import('@tuturuuu/utils/encryption');
  const decrypted = decryptCalendarEvents(events, state.key);
  return decrypted as Array<WithheldEventRow<T>>;
}

/**
 * Encrypt the sensitive fields of a calendar event before storage.
 * Returns the original data untouched only when the workspace has no
 * encryption key. Throws when the workspace is encrypted but its key cannot
 * be used (see `getWorkspaceKeyForTools` for strict vs non-strict errors).
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

  const { encryptCalendarEventFields } =
    await import('@tuturuuu/utils/encryption');
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
