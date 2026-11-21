import { Undo2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useCallback } from 'react';
import type { FleetAnswerReceipt } from '../fleet/contract';
import type { AnswerState } from '../fleet/answer';
import { useI18n } from '../i18n';
import { toneBadge } from './tone';

/** Receipt line: sent and waiting, or picked up, with the revision. */
export function ReceiptLine({ receipt }: { receipt: FleetAnswerReceipt }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline" className={toneBadge('green')}>
        {t('ask.sent')}
      </Badge>
      <span className="text-muted-foreground">
        {receipt.pickedUp ? t('ask.pickedUp') : t('ask.waiting')} ·{' '}
        {t('ask.revision', { n: receipt.revision })}
      </span>
    </div>
  );
}

/** What replaces the actions once an answer is queued, sent or refused. */
export function AnswerOutcome({
  state,
  now,
  onUndo,
  onCheck,
  onRetry,
}: {
  state: Extract<
    AnswerState,
    {
      kind:
        | 'pending'
        | 'sending'
        | 'retrying'
        | 'sent'
        | 'closed'
        | 'superseded'
        | 'error';
    }
  >;
  now: number;
  onUndo: () => void;
  onCheck: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  // Stable, so focus moves to Undo once on mount and never again per tick.
  const focusOnMount = useCallback(
    (button: HTMLButtonElement | null) =>
      button?.focus({ preventScroll: true }),
    []
  );
  switch (state.kind) {
    case 'pending':
      return (
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          aria-live="polite"
        >
          <span className="text-muted-foreground tabular-nums">
            {t('ask.sending', {
              seconds: Math.max(1, Math.ceil((state.sendsAt - now) / 1000)),
            })}
          </span>
          {/* The tapped option is gone; keyboard focus moves to Undo. */}
          <Button size="sm" variant="ghost" onClick={onUndo} ref={focusOnMount}>
            <Undo2 />
            {t('ask.undo')}
          </Button>
        </div>
      );
    case 'sending':
      return (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {t('ask.sendingNow')}
        </p>
      );
    case 'retrying':
      return (
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          aria-live="polite"
        >
          <span className="text-muted-foreground tabular-nums">
            {t('ask.retrying', {
              seconds: Math.max(1, Math.ceil((state.retryAt - now) / 1000)),
            })}
          </span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('ask.retryNow')}
          </Button>
        </div>
      );
    case 'sent':
      return <ReceiptLine receipt={state.receipt} />;
    case 'superseded':
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{t('ask.superseded')}</p>
          <ReceiptLine receipt={state.receipt} />
        </div>
      );
    case 'closed':
      return <p className="text-muted-foreground text-sm">{t('ask.closed')}</p>;
    case 'error':
      return (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-dynamic-red">
            {state.maybeSent ? t('ask.failed') : t('ask.notSent')}
          </span>
          <Button size="sm" variant="outline" onClick={onCheck}>
            {t('ask.check')}
          </Button>
        </div>
      );
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
