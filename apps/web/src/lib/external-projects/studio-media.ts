import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ExternalProjectEntry, Json } from '@tuturuuu/types';
import { invalidateWorkspaceExternalProjectCache } from './cache';

type StudioMediaUpdate = {
  audio?: string[];
  cover?: string;
  gallery?: string[];
  webgl?: string;
};

type JsonObject = { [key: string]: Json | undefined };

function record(value: Json | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function append(existing: Json | undefined, added: string[] = []) {
  const ids = Array.isArray(existing)
    ? existing.filter((id): id is string => typeof id === 'string')
    : [];
  return [...new Set([...ids, ...added])];
}

type EntryUpdate = Partial<ExternalProjectEntry>;
type EntryScope = {
  entryId: string;
  workspaceId: string;
  actorId: string | null;
};

export class StudioMediaConflict extends Error {}

export async function updateExternalProjectEntryFields(
  admin: TypedSupabaseClient,
  scope: EntryScope,
  values: EntryUpdate
) {
  const profile = values.profile_data;
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    return updateCurrentEntry(admin, scope, (entry) => ({
      ...values,
      profile_data: {
        ...profile,
        studioMedia:
          record(entry.profile_data).studioMedia ?? profile.studioMedia,
      },
    }));
  }

  const { data, error } = await admin
    .from('workspace_external_project_entries')
    .update({ ...values, updated_by: scope.actorId })
    .eq('ws_id', scope.workspaceId)
    .eq('id', scope.entryId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  await invalidateWorkspaceExternalProjectCache(scope.workspaceId);
  return data;
}

export function updateStudioMedia(
  admin: TypedSupabaseClient,
  { selection, ...scope }: EntryScope & { selection: StudioMediaUpdate }
) {
  return updateCurrentEntry(admin, scope, (entry) => {
    const profile = record(entry.profile_data);
    const previous = record(profile.studioMedia);
    const cover = selection.cover ?? previous.cover;
    const studioMedia = {
      ...previous,
      cover,
      audio: append(previous.audio, selection.audio),
      gallery: append(previous.gallery, selection.gallery).filter(
        (id) => id !== cover
      ),
      webgl: selection.webgl ?? previous.webgl,
    };
    return { profile_data: { ...profile, studioMedia } };
  });
}

async function updateCurrentEntry(
  admin: TypedSupabaseClient,
  { workspaceId, entryId, actorId }: EntryScope,
  update: (entry: ExternalProjectEntry) => EntryUpdate
) {
  const entries = () => admin.from('workspace_external_project_entries');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: current, error: readError } = await entries()
      .select('*')
      .eq('ws_id', workspaceId)
      .eq('id', entryId)
      .single();
    if (readError) throw new Error(readError.message);
    const { data: updated, error: writeError } = await entries()
      .update({
        ...update(current),
        updated_by: actorId,
      })
      .eq('ws_id', workspaceId)
      .eq('id', entryId)
      .eq('updated_at', current.updated_at)
      .select('*')
      .maybeSingle();
    if (writeError) throw new Error(writeError.message);
    if (updated) {
      await invalidateWorkspaceExternalProjectCache(workspaceId);
      return updated;
    }
  }
  throw new StudioMediaConflict('Entry changed while saving media');
}
