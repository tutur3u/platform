import { Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { BRIDGE_LIMITS } from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef, useState } from 'react';
import { toneBadge, type Tone } from '../components/tone';
import { subscribeOwnerLive } from '../fleet/owner-live';
import { useI18n } from '../i18n';
import {
  deliveryLabel,
  deliverySteps,
  type Outgoing,
  pendingReceiptKey,
  settle,
} from './reply-model';
import { replyReceiptFn, threadReplyFn } from './server';

const TONE: Record<string, Tone> = {
  sending: 'gray',
  sent: 'blue',
  steered: 'green',
  started: 'green',
  queued: 'orange',
  failed: 'red',
  expired: 'red',
};

function ReceiptLine({ item }: { item: Outgoing }) {
  const { t } = useI18n();
  const label = deliveryLabel(item.status);
  if (!label) {
    const code =
      item.status.kind === 'error' ? item.status.code : 'unavailable';
    return (
      <div
        role="alert"
        className="mt-2 flex flex-wrap items-center gap-2 text-dynamic-red text-xs"
      >
        {t(`projects.error.${code}`)}
        {code === 'mfa_required' ? (
          <a
            className="underline"
            href={`/login?nextUrl=${encodeURIComponent(location.pathname + location.search)}`}
          >
            {t('projects.reply.signIn')}
          </a>
        ) : null}
      </div>
    );
  }
  const steps = deliverySteps(label);
  return (
    <div
      className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs"
      aria-live="polite"
    >
      <span className="flex gap-1" aria-hidden>
        {[1, 2].map((step) => (
          <i
            key={step}
            className={cn(
              'block h-0.5 w-5 rounded',
              steps >= step ? 'bg-dynamic-green' : 'bg-border'
            )}
          />
        ))}
      </span>
      <span
        className={cn(
          'rounded-md border px-1.5 py-0.5 font-medium',
          toneBadge(TONE[label] ?? 'gray')
        )}
      >
        {t(`projects.reply.${label}`)}
      </span>
    </div>
  );
}

/**
 * Steered replies into the open thread. A reply shows from its receipt: it
 * appears in the transcript only once the machine delivers it. A pending
 * receipt is read again when the owner socket announces it settled.
 */
export function ReplyComposer({
  environmentId,
  threadId,
}: {
  environmentId?: string;
  threadId: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<Outgoing[]>([]);

  const latest = useRef(sent);
  latest.current = sent;

  useEffect(
    () =>
      subscribeOwnerLive((frame) => {
        if (frame.t !== 'receipt') return;
        const id = frame.receipt.id;
        for (const item of latest.current) {
          const key = pendingReceiptKey(item, id);
          if (key)
            // A failed read keeps the last receipt; the next notice retries.
            void replyReceiptFn({ data: { id } }).then((result) => {
              if (result.kind === 'ok')
                setSent((list) => settle(list, key, result));
            });
        }
      }),
    []
  );

  const text = draft.trim();
  const tooLong = draft.length > BRIDGE_LIMITS.maxTextChars;
  const send = () => {
    if (!text || tooLong) return;
    const key = crypto.randomUUID();
    setSent((list) => [...list, { key, text, status: { kind: 'sending' } }]);
    setDraft('');
    void threadReplyFn({
      data: { environmentId, threadId, text, idempotencyKey: key },
    })
      .catch(() => ({ kind: 'error', code: 'unavailable' }) as const)
      .then((result) => setSent((list) => settle(list, key, result)));
  };

  return (
    <>
      {sent.map((item) => (
        <div
          key={item.key}
          className="max-w-[40rem] self-end rounded-lg bg-secondary px-3.5 py-2.5"
        >
          <p className="whitespace-pre-wrap break-words">{item.text}</p>
          <ReceiptLine item={item} />
        </div>
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
          <Button type="submit" disabled={!text || tooLong}>
            <Send />
            {t('projects.reply.send')}
          </Button>
        </div>
        <p className="mt-1.5 text-muted-foreground text-xs">
          {t('projects.reply.hint', {
            max: BRIDGE_LIMITS.maxTextChars.toLocaleString(),
          })}{' '}
          <kbd className="rounded border px-1 font-mono text-[0.6875rem]">
            {t('projects.reply.shortcut')}
          </kbd>
        </p>
      </form>
    </>
  );
}
