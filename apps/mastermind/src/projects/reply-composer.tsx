import { Send } from '@tuturuuu/icons';
import { FLEET_REPLY_MAX_CHARS } from '@tuturuuu/internal-api/mastermind-threads';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useEffect, useRef, useState } from 'react';
import { subscribeOwnerLive } from '../fleet/owner-live';
import { createThreadReply, type ThreadReply } from '../fleet/thread-reply';
import { useI18n } from '../i18n';
import { ReplyBubble, useReplyState } from './reply-bubble';
import { replyReceiptFn, threadReplyFn } from './server';

/**
 * Steered replies into the open thread. Each reply has its own shared reply
 * state, kept for the life of the page: its idempotency key survives Retry
 * and a second-factor step-up, and a reply still held for the machine keeps
 * reading its receipt on owner-socket notices after the owner writes
 * another. A reply reaches the transcript once the machine delivers it.
 */
export function ReplyComposer({
  machineId,
  environmentId,
  threadId,
}: {
  machineId: string;
  environmentId?: string;
  threadId: string;
}) {
  const { t } = useI18n();
  const make = () =>
    createThreadReply(
      { machineId, environmentId, threadId },
      {
        send: ({ text, idempotencyKey }) =>
          threadReplyFn({
            data: { environmentId, threadId, text, idempotencyKey },
          }),
        receipt: (id) => replyReceiptFn({ data: { id } }),
      }
    );
  const [replies, setReplies] = useState<ThreadReply[]>(() => [make()]);
  // The same list, updated at once, so two clicks in one render see each other.
  const live = useRef(replies);
  const add = (reply: ThreadReply) => {
    live.current = [...live.current, reply];
    setReplies(live.current);
  };
  const current = replies[replies.length - 1] as ThreadReply;
  const state = useReplyState(current);
  const [draft, setDraft] = useState('');

  useEffect(
    () =>
      subscribeOwnerLive((frame) => {
        const id = frame.t === 'receipt' ? frame.receipt.id : undefined;
        if (
          frame.t !== 'receipt' &&
          !(frame.t === 'poke' && frame.poke.topic === 'threads')
        )
          return;
        // refresh() reads only a reply still held for the machine.
        for (const reply of replies) void reply.refresh(id);
      }),
    [replies]
  );

  const text = draft.trim();
  const tooLong = draft.length > FLEET_REPLY_MAX_CHARS;
  const busy = state.phase === 'sending' || state.phase === 'sent';
  const send = () => {
    // Decide from the machines' states now, not the last render, so a double
    // click cannot start two replies.
    if (!text || tooLong) return;
    const all = live.current;
    const latest = all[all.length - 1] as ThreadReply;
    const states = all.map((reply) => reply.getState());
    const now = latest.getState();
    if (states.some((s) => s.phase === 'sending') || now.phase === 'sent')
      return;
    setDraft('');
    // The same text as a reply that can still be resent is that reply
    // again, under its key; anything else starts a new reply.
    const again = all.find((reply, index) => {
      const s = states[index];
      return (
        s !== undefined &&
        'text' in s &&
        s.text === text &&
        (s.phase === 'needs_mfa' || (s.phase === 'failed' && s.retryable))
      );
    });
    const target =
      again ?? (now.phase === 'idle' ? latest : undefined) ?? make();
    if (!all.includes(target)) add(target);
    void target.submit(text);
  };
  const writeAnother = () => add(make());

  return (
    <>
      {replies.map((reply) => (
        <ReplyBubble
          key={replies.indexOf(reply)}
          reply={reply}
          onWriteAnother={reply === current ? writeAnother : undefined}
        />
      ))}
      <form
        className="sticky bottom-0 -mx-4 mt-auto border-t bg-card px-4 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            aria-invalid={tooLong || undefined}
            placeholder={t('projects.reply.placeholder')}
            aria-label={t('projects.reply.placeholder')}
            className="min-h-9 resize-none"
          />
          <Button type="submit" disabled={!text || tooLong || busy}>
            <Send />
            {t('projects.reply.send')}
          </Button>
        </div>
        <p className="mt-1.5 text-muted-foreground text-xs">
          {state.phase === 'sent'
            ? t('projects.reply.stillDelivers')
            : t('projects.reply.hint', {
                max: FLEET_REPLY_MAX_CHARS.toLocaleString(),
              })}{' '}
          <kbd className="rounded border px-1 font-mono text-[0.6875rem]">
            {t('projects.reply.shortcut')}
          </kbd>
        </p>
      </form>
    </>
  );
}
