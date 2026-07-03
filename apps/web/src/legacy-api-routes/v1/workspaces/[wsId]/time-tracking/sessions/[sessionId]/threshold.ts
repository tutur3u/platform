import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import dayjs from 'dayjs';

import type { ChainSummary } from './schemas';

export async function getSessionChainRoot(
  sbAdmin: TypedSupabaseClient,
  sessionId: string
): Promise<{ rootSessionId: string }> {
  const { data, error } = await sbAdmin
    .rpc('get_session_chain_root', {
      session_id_input: sessionId,
    })
    .single();

  if (error || !data) {
    return { rootSessionId: sessionId };
  }

  return {
    rootSessionId: (data as { root_session_id: string }).root_session_id,
  };
}

export async function checkSessionThreshold(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  sessionStartTime: string,
  options?: {
    sessionId?: string;
    returnChainDetails?: boolean;
  }
): Promise<{
  exceeds: boolean;
  thresholdDays: number | null;
  message?: string;
  chainSummary?: ChainSummary;
}> {
  const { data: workspaceSettings } = await sbAdmin
    .from('workspace_settings')
    .select('missed_entry_date_threshold')
    .eq('ws_id', wsId)
    .single();

  const thresholdDays = workspaceSettings?.missed_entry_date_threshold;

  if (thresholdDays === null || thresholdDays === undefined) {
    return { exceeds: false, thresholdDays: null };
  }

  let startTimeToCheck = sessionStartTime;
  let chainSummary: ChainSummary | undefined;

  if (options?.sessionId) {
    const { rootSessionId } = await getSessionChainRoot(
      sbAdmin,
      options.sessionId
    );

    const { data: rootSession } = await sbAdmin
      .from('time_tracking_sessions')
      .select('start_time')
      .eq('id', rootSessionId)
      .single();

    if (rootSession) {
      startTimeToCheck = rootSession.start_time;
    }

    if (options.returnChainDetails) {
      const { data: summary } = await sbAdmin.rpc('get_session_chain_summary', {
        session_id_input: options.sessionId,
      });
      chainSummary = summary as unknown as ChainSummary | undefined;
    }
  }

  if (thresholdDays === 0) {
    return {
      exceeds: true,
      thresholdDays: 0,
      message: 'All missed entries must be submitted as requests',
      chainSummary,
    };
  }

  const now = dayjs();
  const startTime = dayjs(startTimeToCheck);
  const thresholdAgo = now.subtract(thresholdDays, 'day');

  if (startTime.isBefore(thresholdAgo)) {
    return {
      exceeds: true,
      thresholdDays,
      message: `Cannot complete sessions older than ${thresholdDays} day${thresholdDays !== 1 ? 's' : ''}. Please submit a missed entry request instead.`,
      chainSummary,
    };
  }

  return { exceeds: false, thresholdDays, chainSummary };
}
