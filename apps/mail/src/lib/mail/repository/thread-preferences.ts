import { type AnyRecord, privateTable } from './shared';

type ThreadPreferenceAction = 'snooze' | 'unsnooze' | 'mute' | 'unmute';
export function isThreadPreferenceAction(
  action: string
): action is ThreadPreferenceAction {
  return ['snooze', 'unsnooze', 'mute', 'unmute'].includes(action);
}

// Call only after request-scoped mailbox and message/thread access is verified.
export async function updateThreadPreferences({
  admin,
  mailboxId,
  userId,
  threadIds,
  payload,
}: {
  admin: AnyRecord;
  mailboxId: string;
  userId: string;
  threadIds: string[];
  payload: { action: ThreadPreferenceAction; snoozedUntil?: string };
}) {
  if (!threadIds.length) return;
  const { error } = await admin
    .schema('private')
    .rpc('set_mail_thread_preference', {
      p_mailbox_id: mailboxId,
      p_user_id: userId,
      p_thread_ids: [...new Set(threadIds)],
      p_action: payload.action,
      p_snoozed_until: payload.snoozedUntil ?? null,
    });
  if (error)
    throw new Error(`Failed to update thread preferences: ${error.message}`);
}

export function threadIsVisible(
  state: AnyRecord | undefined,
  folder: string | undefined,
  now = Date.now()
) {
  const snoozed = state?.snoozed_until && Date.parse(state.snoozed_until) > now;
  const muted = Boolean(state?.muted_at);
  if (folder === 'snoozed') return Boolean(snoozed);
  if (folder === 'muted') return muted;
  return folder === 'inbox' || !folder ? !snoozed && !muted : true;
}

export async function loadThreadPreferences(
  admin: AnyRecord,
  mailboxId: string,
  userId: string
) {
  const states = new Map<string, AnyRecord>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await privateTable(admin, 'mail_thread_user_state')
      .select('thread_id,snoozed_until,muted_at')
      .eq('mailbox_id', mailboxId)
      .eq('user_id', userId)
      .or(`muted_at.not.is.null,snoozed_until.gt.${new Date().toISOString()}`)
      .order('thread_id')
      .range(start, start + 999);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code)) return states;
      throw new Error(`Failed to read thread preferences: ${error.message}`);
    }
    for (const state of data ?? []) states.set(state.thread_id, state);
    if ((data ?? []).length < 1000) return states;
  }
}
