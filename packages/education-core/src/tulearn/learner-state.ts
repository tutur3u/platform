import type { TablesInsert, TablesUpdate } from '@tuturuuu/types/supabase';

import { DEFAULT_HEARTS, HEART_REFILL_MS } from './constants';
import { getAdmin } from './db';
import type { Db, TulearnState } from './types';

const LEARNER_STATE_SELECT =
  'hearts, max_hearts, xp_total, current_streak, longest_streak, streak_freezes, last_activity_date, last_heart_refill_at';

const LEARNER_STATE_PUBLIC_SELECT =
  'hearts, max_hearts, xp_total, current_streak, longest_streak, streak_freezes, last_activity_date';

async function readPublicLearnerState({
  sbAdmin,
  userId,
  wsId,
}: {
  sbAdmin: Db;
  userId: string;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .from('tulearn_learner_state')
    .select(LEARNER_STATE_PUBLIC_SELECT)
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function getLearnerState({
  db,
  userId,
  wsId,
}: {
  db?: Db;
  userId: string;
  wsId: string;
}): Promise<TulearnState> {
  const sbAdmin = await getAdmin(db);
  const { data, error } = await sbAdmin
    .from('tulearn_learner_state')
    .select(LEARNER_STATE_SELECT)
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const initial: TablesInsert<'tulearn_learner_state'> = {
      ws_id: wsId,
      user_id: userId,
      hearts: DEFAULT_HEARTS,
      max_hearts: DEFAULT_HEARTS,
    };
    const { error: createError } = await sbAdmin
      .from('tulearn_learner_state')
      .upsert(initial, {
        ignoreDuplicates: true,
        onConflict: 'ws_id,user_id',
      });
    if (createError) throw createError;
    return readPublicLearnerState({ sbAdmin, userId, wsId });
  }

  const lastHeartRefillAt = data.last_heart_refill_at;
  const lastRefill = lastHeartRefillAt
    ? new Date(lastHeartRefillAt).getTime()
    : Number.NaN;
  if (
    data.hearts < data.max_hearts &&
    lastHeartRefillAt &&
    Number.isFinite(lastRefill) &&
    lastRefill > 0 &&
    Date.now() - lastRefill >= HEART_REFILL_MS
  ) {
    const now = new Date().toISOString();
    const refillPayload: TablesUpdate<'tulearn_learner_state'> = {
      hearts: data.max_hearts,
      last_heart_refill_at: now,
      updated_at: now,
    };
    const { data: refilled, error: refillError } = await sbAdmin
      .from('tulearn_learner_state')
      .update(refillPayload)
      .eq('ws_id', wsId)
      .eq('user_id', userId)
      .eq('hearts', data.hearts)
      .eq('last_heart_refill_at', lastHeartRefillAt)
      .select(LEARNER_STATE_PUBLIC_SELECT)
      .maybeSingle();
    if (refillError) throw refillError;
    if (!refilled) return readPublicLearnerState({ sbAdmin, userId, wsId });
    return refilled;
  }

  return data;
}

export async function loseHeart({
  db,
  userId,
  wsId,
}: {
  db?: Db;
  userId: string;
  wsId: string;
}) {
  const sbAdmin = await getAdmin(db);
  const { data, error } = await sbAdmin.rpc('lose_tulearn_heart', {
    p_user_id: userId,
    p_ws_id: wsId,
  });

  if (error) throw error;
  const [result] = data ?? [];
  if (!result) throw new Error('lose_tulearn_heart returned no rows');
  return result.hearts;
}
