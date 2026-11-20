import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  ExternalProjectDeliveryPayload,
  ExternalProjectEntry,
  Json,
} from '@tuturuuu/types';
import { assetPublicationProofs } from './asset-publication-store';
import { invalidateWorkspaceExternalProjectCache } from './cache';
import { publicationEventId } from './published-assets';

type EventKind = 'publish' | 'preview' | 'unpublish';

export async function recordEntryPublication(
  admin: TypedSupabaseClient,
  input: {
    actorId: string;
    canonicalProjectId: string;
    entryId: string;
    eventKind: EventKind;
    visibilityScope: string;
    workspaceId: string;
    readPayload: () => Promise<ExternalProjectDeliveryPayload>;
    readManifest: (
      entry: ExternalProjectEntry
    ) => Promise<Record<string, string>>;
  }
) {
  const {
    actorId,
    canonicalProjectId,
    entryId,
    eventKind,
    visibilityScope,
    workspaceId,
  } = input;
  const entries = () => admin.from('workspace_external_project_entries');
  const events = () => admin.from('workspace_external_project_publish_events');
  const { data: current, error: readError } = await entries()
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('id', entryId)
    .single();
  if (readError) throw new Error(readError.message);

  let entry = current;
  let manifest: Record<string, string> | null = null;
  if (
    eventKind === 'publish' ||
    (eventKind === 'unpublish' && current.status !== 'draft')
  ) {
    const priorPublication = current.published_at
      ? Date.parse(current.published_at) + 1
      : 0;
    const publishedAt =
      eventKind === 'publish'
        ? new Date(Math.max(Date.now(), priorPublication)).toISOString()
        : null;
    if (publishedAt)
      manifest = await input.readManifest({
        ...current,
        published_at: publishedAt,
      });
    const { data: updated, error: writeError } = await entries()
      .update({
        published_at: publishedAt,
        status: eventKind === 'publish' ? 'published' : 'draft',
        updated_by: actorId,
      })
      .eq('ws_id', workspaceId)
      .eq('id', entryId)
      .eq('updated_at', current.updated_at)
      .select('*')
      .single();
    if (writeError) throw new Error(writeError.message);
    entry = updated;
  }

  try {
    let id: string | undefined;
    if (eventKind === 'publish') {
      if (!entry.published_at) throw new Error('Missing publication timestamp');
      id = publicationEventId(
        workspaceId,
        canonicalProjectId,
        entry.id,
        eventKind,
        entry.published_at
      );
    } else if (eventKind === 'unpublish') {
      id = publicationEventId(
        workspaceId,
        canonicalProjectId,
        entry.id,
        eventKind,
        entry.updated_at
      );
      const { data: recorded, error } = await events()
        .select('id')
        .eq('id', id)
        .eq('ws_id', workspaceId)
        .eq('canonical_external_project_id', canonicalProjectId)
        .eq('entry_id', entry.id)
        .eq('event_kind', eventKind)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (recorded) return entry;
    }

    const payload = await input.readPayload();
    const event = {
      ...(id ? { id } : {}),
      canonical_external_project_id: canonicalProjectId,
      entry_id: entry.id,
      event_kind: eventKind,
      payload: payload as unknown as NonNullable<Json>,
      profile_data: payload.profileData as NonNullable<Json>,
      triggered_by: actorId,
      visibility_scope: visibilityScope,
      ws_id: workspaceId,
    };
    const { error } = await (id
      ? events().upsert(event, { ignoreDuplicates: true, onConflict: 'id' })
      : events().insert(event));
    if (error) throw new Error(error.message);

    if (manifest && id && entry.published_at && visibilityScope === 'public') {
      const { error: proofError } = await assetPublicationProofs(admin).upsert(
        {
          id,
          ws_id: workspaceId,
          canonical_external_project_id: canonicalProjectId,
          entry_id: entry.id,
          published_at: entry.published_at,
          asset_revisions: manifest,
        },
        { ignoreDuplicates: true, onConflict: 'id' }
      );
      if (proofError) throw new Error(proofError.message);
    }
    return entry;
  } finally {
    if (eventKind !== 'preview')
      await invalidateWorkspaceExternalProjectCache(workspaceId);
  }
}
