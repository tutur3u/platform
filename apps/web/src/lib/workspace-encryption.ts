/**
 * Workspace encryption utilities for API routes
 *
 * Provides helper functions to manage workspace encryption keys
 * and encrypt/decrypt calendar event data transparently.
 *
 * Note: This module requires the workspace_encryption_keys migration to be applied.
 * Until then, encryption will be gracefully disabled.
 */

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { EncryptedCalendarEventFields } from '@tuturuuu/utils/encryption';
import {
  decryptCalendarEvents,
  decryptWorkspaceKey,
  encryptCalendarEventFields,
  encryptWorkspaceKey,
  generateWorkspaceKey,
  getMasterKey,
  isEncryptionEnabled,
} from '@tuturuuu/utils/encryption';

// Type for events with optional is_encrypted field (backward compatible)
interface CalendarEventMaybeEncrypted {
  id: string;
  title: string;
  description: string;
  location?: string | null;
  is_encrypted?: boolean;
  [key: string]: unknown;
}

/**
 * Get or create the encryption key for a workspace
 * Returns the decrypted workspace key ready for use
 */
export async function getOrCreateWorkspaceKey(
  wsId: string
): Promise<Buffer | null> {
  if (!isEncryptionEnabled()) {
    return null;
  }

  try {
    const masterKey = getMasterKey();
    const supabase = await createAdminClient();

    const { data: existingKey, error: selectError } = await supabase
      .from('workspace_encryption_keys')
      .select('encrypted_key')
      .eq('ws_id', wsId)
      .maybeSingle();

    if (selectError) {
      // Table might not exist yet
      console.warn('Encryption keys table not available:', selectError.message);
      return null;
    }

    if (existingKey) {
      const key = (existingKey as unknown as { encrypted_key: string })
        .encrypted_key;
      return decryptWorkspaceKey(key, masterKey);
    }

    // Create new key for this workspace
    const newKey = generateWorkspaceKey();
    const encryptedKey = encryptWorkspaceKey(newKey, masterKey);

    const { error: insertError } = await supabase
      .from('workspace_encryption_keys')
      .insert({
        ws_id: wsId,
        encrypted_key: encryptedKey,
      } as never);

    if (insertError) {
      console.error('Failed to create workspace encryption key:', insertError);
      return null;
    }

    return newKey;
  } catch (error) {
    console.warn('Encryption not available:', error);
    return null;
  }
}

/**
 * Get the encryption key for a workspace (read-only, does not create)
 */
export async function getWorkspaceKey(wsId: string): Promise<Buffer | null> {
  if (!isEncryptionEnabled()) {
    return null;
  }

  try {
    const masterKey = getMasterKey();
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('workspace_encryption_keys')
      .select('encrypted_key')
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const key = (data as unknown as { encrypted_key: string }).encrypted_key;
    return decryptWorkspaceKey(key, masterKey);
  } catch (error) {
    console.warn('Failed to get workspace key:', error);
    return null;
  }
}

/**
 * Encrypt calendar event fields before storing
 * If workspaceKey is provided, skips the key lookup
 * Returns all input fields plus is_encrypted flag
 */
export async function encryptEventForStorage<
  T extends EncryptedCalendarEventFields,
>(
  wsId: string,
  event: T,
  workspaceKey?: Buffer | null
): Promise<T & { is_encrypted: boolean }> {
  const key =
    workspaceKey !== undefined
      ? workspaceKey
      : await getOrCreateWorkspaceKey(wsId);

  if (!key) {
    return { ...event, is_encrypted: false };
  }

  const encrypted = encryptCalendarEventFields(
    {
      title: event.title,
      description: event.description,
      location: event.location,
    },
    key
  );

  return {
    ...event,
    title: encrypted.title,
    description: encrypted.description,
    location: encrypted.location,
    is_encrypted: true,
  };
}

/**
 * Decrypt calendar events after fetching
 */
export async function decryptEventsFromStorage<
  T extends CalendarEventMaybeEncrypted,
>(events: T[], wsId: string): Promise<T[]> {
  if (!events.length) {
    return events;
  }

  // Check if any events are encrypted
  const hasEncryptedEvents = events.some((e) => e.is_encrypted);
  if (!hasEncryptedEvents) {
    return events;
  }

  const key = await getWorkspaceKey(wsId);

  if (!key) {
    console.error(
      'Encrypted events found but no encryption key available for workspace:',
      wsId
    );
    return events;
  }

  // Convert to the format expected by decryptCalendarEvents and cast back
  const eventsWithFlag = events.map((e) => ({
    ...e,
    is_encrypted: e.is_encrypted ?? false,
  }));
  const decrypted = decryptCalendarEvents(
    eventsWithFlag as unknown as Parameters<typeof decryptCalendarEvents>[0],
    key
  );
  return decrypted as unknown as T[];
}

/**
 * Decrypt a single calendar event
 */
export async function decryptEventFromStorage<
  T extends CalendarEventMaybeEncrypted,
>(event: T, wsId: string): Promise<T> {
  if (!event.is_encrypted) {
    return event;
  }

  const key = await getWorkspaceKey(wsId);

  if (!key) {
    console.error(
      'Encrypted event found but no encryption key available for workspace:',
      wsId
    );
    return event;
  }

  const eventWithFlag = { ...event, is_encrypted: event.is_encrypted ?? false };
  const [decrypted] = decryptCalendarEvents(
    [eventWithFlag] as unknown as Parameters<typeof decryptCalendarEvents>[0],
    key
  );
  return decrypted as unknown as T;
}

/**
 * Helper to encrypt events using a known set of encrypted IDs
 * Used when we have pre-cached the encrypted status before any deletes happen
 */
function encryptEventsWithKnownIds<
  T extends {
    google_event_id: string;
    title: string;
    description?: string;
    location?: string | null;
  },
>(
  events: T[],
  encryptedEventIds: Set<string>,
  key: Buffer
): (T & { is_encrypted?: boolean })[] {
  // Log events NOT in cache (helpful for debugging)
  const notInCache = events.filter(
    (e) => !encryptedEventIds.has(e.google_event_id)
  );
  if (notInCache.length > 0) {
    console.log('⚠️ [E2EE DEBUG] Events NOT in encrypted cache:', {
      count: notInCache.length,
      cacheSize: encryptedEventIds.size,
      eventIds: notInCache.slice(0, 3).map((e) => e.google_event_id),
    });
  }

  return events.map((event) => {
    if (!encryptedEventIds.has(event.google_event_id)) {
      // Event is not encrypted, keep as plaintext
      return { ...event, is_encrypted: false };
    }

    // Event is encrypted - encrypt the incoming Google data
    const encrypted = encryptCalendarEventFields(
      {
        title: event.title || '',
        description: event.description || '',
        location: event.location || undefined,
      },
      key
    );

    return {
      ...event,
      title: encrypted.title,
      description: encrypted.description,
      location: encrypted.location ?? null,
      is_encrypted: true,
    };
  });
}

/**
 * Encrypt incoming Google Calendar events before upsert
 *
 * This implements "decrypt, compare, re-encrypt" for Google sync:
 * 1. Query which existing events are encrypted
 * 2. For events that are encrypted, encrypt the incoming Google data
 * 3. For events that are not encrypted, leave them as plaintext
 *
 * This allows Google Calendar updates to flow through while maintaining encryption.
 *
 * @param wsId - Workspace ID
 * @param events - Events from Google Calendar to process
 * @param preCachedEncryptedIds - Optional pre-cached set of encrypted event IDs (to avoid race conditions with parallel deletes)
 */
export async function encryptGoogleSyncEvents<
  T extends {
    google_event_id: string;
    title: string;
    description?: string;
    location?: string | null;
  },
>(
  wsId: string,
  events: T[],
  preCachedEncryptedIds?: Set<string>
): Promise<(T & { is_encrypted?: boolean })[]> {
  if (!isEncryptionEnabled() || events.length === 0) {
    return events;
  }

  const key = await getWorkspaceKey(wsId);
  if (!key) {
    // No encryption key = don't encrypt
    return events;
  }

  // If pre-cached IDs are provided, use them directly (avoids race condition with parallel deletes)
  if (preCachedEncryptedIds && preCachedEncryptedIds.size > 0) {
    console.log('🔍 [E2EE DEBUG] Using pre-cached encrypted IDs:', {
      count: preCachedEncryptedIds.size,
    });
    return encryptEventsWithKnownIds(events, preCachedEncryptedIds, key);
  }

  const supabase = await createAdminClient();

  // Get all google_event_ids from incoming events
  const googleEventIds = events
    .map((e) => e.google_event_id)
    .filter((id): id is string => !!id);

  if (googleEventIds.length === 0) {
    return events;
  }

  // Query which events are currently encrypted in the database
  // Batch the query to avoid URL length limits (max ~100 IDs per query)
  const BATCH_SIZE = 100;
  const allExistingEvents: Array<{
    google_event_id: string | null;
    is_encrypted: boolean | null;
  }> = [];

  for (let i = 0; i < googleEventIds.length; i += BATCH_SIZE) {
    const batchIds = googleEventIds.slice(i, i + BATCH_SIZE);
    const { data: batchEvents, error } = await supabase
      .from('workspace_calendar_events')
      .select('google_event_id, is_encrypted')
      .eq('ws_id', wsId)
      .in('google_event_id', batchIds);

    if (error) {
      console.warn(
        `Failed to check encrypted events batch ${i / BATCH_SIZE + 1}:`,
        error
      );
      // Continue with other batches instead of returning early
      continue;
    }

    if (batchEvents) {
      allExistingEvents.push(...batchEvents);
    }
  }

  // Create a set of google_event_ids that are encrypted
  const encryptedEventIds = new Set(
    allExistingEvents
      .filter((e) => e.is_encrypted === true)
      .map((e) => e.google_event_id) || []
  );

  // Debug: Log events that exist in DB but are NOT encrypted
  const existingButNotEncrypted = allExistingEvents
    .filter((e) => e.is_encrypted !== true)
    .map((e) => e.google_event_id);

  if (existingButNotEncrypted.length > 0) {
    console.log('⚠️ [E2EE DEBUG] Events in DB but NOT encrypted:', {
      count: existingButNotEncrypted.length,
      ids: existingButNotEncrypted.slice(0, 5), // First 5 for brevity
    });
  }

  // Debug: Count events NOT found in DB at all
  const allExistingIds = new Set(
    allExistingEvents.map((e) => e.google_event_id)
  );
  const notInDb = events.filter((e) => !allExistingIds.has(e.google_event_id));
  if (notInDb.length > 0) {
    console.log('⚠️ [E2EE DEBUG] Events NOT in DB (new inserts):', {
      count: notInDb.length,
      ids: notInDb.slice(0, 5).map((e) => e.google_event_id),
    });
  }

  // Encrypt the events that need it
  return events.map((event) => {
    if (!encryptedEventIds.has(event.google_event_id)) {
      // Event is not encrypted, keep as plaintext
      return { ...event, is_encrypted: false };
    }

    // Event is encrypted - encrypt the incoming Google data
    const encrypted = encryptCalendarEventFields(
      {
        title: event.title || '',
        description: event.description || '',
        location: event.location || undefined,
      },
      key
    );

    return {
      ...event,
      title: encrypted.title,
      description: encrypted.description,
      location: encrypted.location ?? null,
      is_encrypted: true,
    };
  });
}
