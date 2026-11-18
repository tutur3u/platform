import { Button } from '@tuturuuu/ui/button';
import {
  PollCountdownPill,
  type PollCountdownPillProps,
  PollIndicatorPill,
  type PollIndicatorPillProps,
  PollLiveDot,
} from './poll-countdown-pill';

export interface PollStageToastProps {
  message: string;
  countdown?: PollCountdownPillProps;
  privacy: PollIndicatorPillProps & { kind: 'anonymous' | 'named' };
  openPanelLabel: string;
  onOpenPanel: () => void;
}

export function PollStageToast({
  message,
  countdown,
  privacy,
  openPanelLabel,
  onOpenPanel,
}: PollStageToastProps) {
  return (
    <div className="@container w-full max-w-xl rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-sm">
      <div className="flex min-w-0 flex-col gap-2 @lg:flex-row @lg:items-center @lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <div role="status" className="flex min-w-0 items-center gap-2">
            <PollLiveDot />
            <span className="min-w-0 wrap-anywhere text-sm font-semibold">
              {message}
            </span>
          </div>
          {countdown && (
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="text-muted-foreground">
                {'\u00b7'}
              </span>
              <PollCountdownPill {...countdown} />
            </div>
          )}
          <PollIndicatorPill {...privacy} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-11 min-w-0 self-start px-3 py-1.5 @lg:self-center"
          onClick={onOpenPanel}
        >
          <span className="min-w-0 wrap-anywhere whitespace-normal">
            {openPanelLabel}
          </span>
        </Button>
      </div>
    </div>
  );
}

export interface PollStageResultsCardProps {
  title: string;
  question: string;
  locale: string;
  options: readonly { id: string; label: string; percentage: number }[];
}

export function PollStageResultsCard({
  title,
  question,
  locale,
  options,
}: PollStageResultsCardProps) {
  if (options.length === 0) return null;

  const formatPercent = new Intl.NumberFormat(locale, { style: 'percent' });

  return (
    <section
      aria-label={title}
      className="w-full max-w-xl space-y-3 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4"
    >
      <header className="space-y-1">
        <p className="wrap-anywhere text-xs font-medium text-muted-foreground">
          {title}
        </p>
        <h2 className="wrap-anywhere text-sm font-semibold sm:text-base">
          {question}
        </h2>
      </header>
      <ul className="space-y-2">
        {options.map(({ id, label, percentage }) => {
          const percent = Number.isFinite(percentage)
            ? Math.round(Math.max(0, Math.min(100, percentage)))
            : 0;

          return (
            <li
              key={id}
              className="space-y-1.5 rounded-xl bg-muted px-2.5 py-2"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 text-sm">
                <span className="wrap-anywhere">{label}</span>
                <span className="font-semibold tabular-nums">
                  {formatPercent.format(percent / 100)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-1.5 overflow-hidden rounded-full bg-background"
              >
                <div
                  className="h-full rounded-full bg-chart-1"
                  style={{ width: String(percent).concat('%') }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
