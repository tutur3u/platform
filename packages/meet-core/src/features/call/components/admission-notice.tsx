import { Clock3, Loader2, ShieldCheck } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

export function AdmissionNotice({
  waiting,
  connecting,
}: {
  waiting: boolean;
  connecting: boolean;
}) {
  const t = useTranslations('meet.call');
  const Icon = waiting ? Clock3 : connecting ? Loader2 : ShieldCheck;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-5 flex gap-3 rounded-xl border bg-muted/30 p-4"
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 size-5 shrink-0 text-primary ${connecting && !waiting ? 'animate-spin' : ''}`}
      />
      <div className="space-y-1">
        <p className="font-medium text-sm">
          {t(
            waiting
              ? 'waiting_for_host'
              : connecting
                ? 'connecting'
                : 'ready_to_join'
          )}
        </p>
        <p className="text-muted-foreground text-sm">
          {t(waiting ? 'waiting_explanation' : 'lobby_hint')}
        </p>
      </div>
    </div>
  );
}
