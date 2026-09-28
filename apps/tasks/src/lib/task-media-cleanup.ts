import type { createAdminClient } from '@tuturuuu/supabase/next/server';

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

const MEDIA_FILENAME =
  /^\d{13}_[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}_.+\.(?:png|jpe?g|gif|webp|avif|svg|mp4|mov|webm|m4v)$/i;

export function taskMediaFilename(path: string): string | null {
  const parts = path.split('/');
  if (
    (parts.length !== 3 && parts.length !== 4) ||
    parts[1] !== 'task-images' ||
    (parts.length === 4 && !/^[0-9a-f-]{36}$/i.test(parts[2] ?? ''))
  ) {
    return null;
  }

  const filename = parts.at(-1) ?? '';
  return MEDIA_FILENAME.test(filename) ? filename : null;
}

export async function taskMediaIsReferenced(
  admin: AdminClient,
  filename: string
): Promise<boolean> {
  // The generated UUID is unique across workspaces and remains unchanged in
  // serialized editor URLs. Searching it avoids interpreting URL escaping.
  const marker = filename.split('_')[1];
  if (!marker) throw new Error('Invalid task media filename');
  const pattern = `%${marker}%`;

  const [tasks, drafts] = await Promise.all([
    admin.from('tasks').select('id').ilike('description', pattern).limit(1),
    admin
      .from('task_drafts')
      .select('id')
      .ilike('description', pattern)
      .limit(1),
  ]);

  if (tasks.error || drafts.error) {
    throw tasks.error ?? drafts.error;
  }

  return !!tasks.data?.length || !!drafts.data?.length;
}

export async function removeUnreferencedTaskMedia(
  admin: AdminClient,
  path: string
): Promise<boolean> {
  const filename = taskMediaFilename(path);
  if (!filename) throw new Error('Invalid task media path');
  if (await taskMediaIsReferenced(admin, filename)) return false;

  const { error } = await admin.storage.from('workspaces').remove([path]);
  if (error) throw error;
  return true;
}
