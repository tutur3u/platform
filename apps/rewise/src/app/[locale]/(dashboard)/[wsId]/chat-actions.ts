'use server';

import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';

const pinInput = z.object({ chatId: z.guid(), pinned: z.boolean() });

export async function setRewiseChatPinned(chatId: string, pinned: boolean) {
  const input = pinInput.safeParse({ chatId, pinned });
  if (!input.success) return false;

  const user = await getSatelliteAppSessionUser('rewise');
  if (!user?.id) return false;

  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin
    .from('ai_chats')
    .update({ pinned: input.data.pinned })
    .eq('id', input.data.chatId)
    .eq('creator_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) console.error('Error pinning chat', error);
  return !error && Boolean(data);
}
