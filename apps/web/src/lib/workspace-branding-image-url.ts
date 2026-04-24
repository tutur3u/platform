import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/** Values suitable for `next/image` `src` (absolute URL or app-relative path). */
export function isUsableNextImageSrc(
  value: string | null | undefined
): boolean {
  if (!value?.trim()) return false;
  const s = value.trim();
  return /^https?:\/\//i.test(s) || s.startsWith('/');
}

/**
 * Workspace `logo_url` / `avatar_url` often store a Supabase Storage object path
 * (e.g. `{wsId}/file.jpg`), not a public URL. `next/image` requires http(s) or a
 * leading `/`. Resolves storage paths to a short-lived signed URL via service role.
 */
export async function resolveWorkspaceImageSrcForNext(
  sbAdmin: TypedSupabaseClient,
  raw: string | null | undefined
): Promise<string | null> {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (isUsableNextImageSrc(s)) return s;

  const { data, error } = await sbAdmin.storage
    .from('workspaces')
    .createSignedUrl(s, 60 * 15);

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

export async function resolveWorkspaceBrandingUrlsForNext(
  sbAdmin: TypedSupabaseClient,
  input: { logo_url?: string | null; avatar_url?: string | null }
): Promise<{ logo_url: string | null; avatar_url: string | null }> {
  const [logo_url, avatar_url] = await Promise.all([
    resolveWorkspaceImageSrcForNext(sbAdmin, input.logo_url),
    resolveWorkspaceImageSrcForNext(sbAdmin, input.avatar_url),
  ]);
  return { logo_url, avatar_url };
}
