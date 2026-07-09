import type { Json } from '@tuturuuu/types/supabase';

import { getAdmin } from './db';
import type { Db, TulearnXpSourceType } from './types';

export async function awardTulearnXp({
  db,
  idempotencyKey,
  metadata = {},
  sourceId,
  sourceType,
  userId,
  wsId,
  xp,
}: {
  db?: Db;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  sourceId: string;
  sourceType: TulearnXpSourceType;
  userId: string;
  wsId: string;
  xp: number;
}) {
  const sbAdmin = await getAdmin(db);
  const { data, error } = await sbAdmin.rpc('award_tulearn_xp', {
    p_idempotency_key: idempotencyKey,
    p_metadata: metadata as Json,
    p_source_id: sourceId,
    p_source_type: sourceType,
    p_user_id: userId,
    p_ws_id: wsId,
    p_xp: xp,
  });

  if (error) throw error;

  const [result] = data ?? [];
  if (!result) throw new Error('award_tulearn_xp returned no rows');

  return result;
}
