import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useSyncExternalStore } from 'react';
import type { ThreadReply } from '../fleet/thread-reply';
import { useI18n } from '../i18n';
import { ReceiptLine } from './receipt-line';

export const useReplyState = (reply: ThreadReply) =>
  useSyncExternalStore(reply.subscribe, reply.getState, reply.getState);

/** One reply's bubble, live on its own state machine until it settles. */
export function ReplyBubble({
  reply,
  stepUpHref,
  onStepUp,
  onWriteAnother,
}: {
  reply: ThreadReply;
  /** The sign-in that asks for the second factor anew and comes back. */
  stepUpHref: string;
  /** Keeps the reply for the return trip, just before the page leaves. */
  onStepUp: (pending: { key: string; text: string }) => void;
  onWriteAnother?: () => void;
}) {
  const { t } = useI18n();
  const state = useReplyState(reply);
  if (state.phase === 'idle') return null;
  const canRetry =
    state.phase === 'needs_mfa' ||
    state.phase === 'sent' ||
    (state.phase === 'failed' && state.retryable);
  return (
    <div className="max-w-[40rem] self-end rounded-lg bg-secondary px-3.5 py-2.5">
      <p className="whitespace-pre-wrap break-words">{state.text}</p>
      <ReceiptLine state={state} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs empty:hidden">
        {state.phase === 'needs_mfa' ? (
          <a
            className="underline"
            href={stepUpHref}
            onClick={() => onStepUp({ key: state.key, text: state.text })}
          >
            {t('projects.reply.signIn')}
          </a>
        ) : null}
        {canRetry ? (
          // In `sent` this reads the receipt again; otherwise it resends
          // the same reply under its key.
          <Button size="xs" variant="ghost" onClick={() => void reply.retry()}>
            <RefreshCw />
            {t(
              state.phase === 'sent'
                ? 'projects.reply.checkAgain'
                : 'state.retry'
            )}
          </Button>
        ) : null}
        {state.phase === 'sent' && onWriteAnother ? (
          <Button size="xs" variant="ghost" onClick={onWriteAnother}>
            {t('projects.reply.writeAnother')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
