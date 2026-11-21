import type { ReplyState } from '../fleet/thread-reply';
import { cn } from '@tuturuuu/utils/format';
import { toneBadge, type Tone } from '../components/tone';
import { useI18n } from '../i18n';
import { threadErrorCode } from './model';

type Shown = Exclude<ReplyState, { phase: 'idle' }>;
type Label =
  | 'sending'
  | 'sent'
  | 'steered'
  | 'started'
  | 'queued'
  | 'failed'
  | 'expired';

const TONE: Record<Label, Tone> = {
  sending: 'gray',
  sent: 'blue',
  steered: 'green',
  started: 'green',
  queued: 'orange',
  failed: 'red',
  expired: 'red',
};

/** The receipt's words, only from what the machine or Web reported. */
export function receiptLabel(state: Shown): Label | undefined {
  switch (state.phase) {
    case 'sending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'delivered':
      return state.reply.delivery ?? 'steered';
    case 'failed':
      if (state.error === 'expired') return 'expired';
      return state.error === 'machine_refused' ? 'failed' : undefined;
    default:
      return undefined;
  }
}

/** Sending, Sent, then delivered: two segments of a track and a badge. */
export function ReceiptLine({ state }: { state: Shown }) {
  const { t } = useI18n();
  const label = receiptLabel(state);
  if (!label) {
    const code =
      state.phase === 'needs_mfa'
        ? 'mfa_required'
        : state.phase === 'failed' &&
            state.error !== 'expired' &&
            state.error !== 'machine_refused'
          ? threadErrorCode(state.error)
          : 'unavailable';
    return (
      <p role="alert" className="mt-2 text-dynamic-red text-xs">
        {t(`projects.error.${code}`)}
      </p>
    );
  }
  const steps =
    label === 'sending' ? 0 : label === 'sent' || TONE[label] === 'red' ? 1 : 2;
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
          toneBadge(TONE[label])
        )}
      >
        {t(`projects.reply.${label}`)}
      </span>
    </div>
  );
}
