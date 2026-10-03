import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import type { CreatorIdentity } from '@/components/creator-profile-header';
/** Only public identity fields. Callers must require published worlds before rendering. */
export async function readCreatorIdentity(
  identifier: string
): Promise<CreatorIdentity | null> {
  const isId = z.guid().safeParse(identifier).success;
  if (!isId && !/^[a-zA-Z0-9_]{1,100}$/.test(identifier)) return null;
  const supabase = await createAdminClient({ noCookie: true });
  const { data, error } = await supabase
    .from('users')
    .select('id,display_name,handle,bio,avatar_url')
    .eq(isId ? 'id' : 'handle', identifier)
    .maybeSingle();
  if (error) throw new Error('Unable to read creator identity');
  if (!data) return null;
  // The additive banner column can arrive after the satellite deployment.
  const { data: banner, error: bannerError } = await supabase
    .from('users')
    .select('banner_url')
    .eq('id', data.id)
    .maybeSingle();
  if (bannerError && !['42703', 'PGRST204'].includes(bannerError.code))
    throw new Error('Unable to read creator banner');
  const parsedBanner = z
    .object({ banner_url: z.string().nullable() })
    .nullable()
    .safeParse(banner);
  if (!bannerError && !parsedBanner.success)
    throw new Error('Unable to read creator banner');
  return {
    ...data,
    banner_url: parsedBanner.success
      ? (parsedBanner.data?.banner_url ?? null)
      : null,
  };
}
