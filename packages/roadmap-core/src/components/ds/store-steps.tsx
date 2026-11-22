import { Check } from '@tuturuuu/icons';
import { releaseSteps, type StepState } from '../../content/store-releases';
import { fill } from '../insights/format';
import type { Lang, Messages } from '../shared';
import type { Store } from './store-data';

const FIELDS = [
  'targetSubmitDate',
  'submittedAt',
  'approvedAt',
  'targetLiveDate',
  'liveAt',
] as const;

const BAR: Record<StepState, string> = {
  done: 'bg-dynamic-purple',
  current: 'bg-dynamic-purple/35',
  upcoming: 'bg-transparent',
  blocked: 'bg-dynamic-red',
};

export function storeDate(lang: Lang, style: 'medium' | 'short' = 'medium') {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'vi-VN', {
    ...(style === 'short'
      ? { day: 'numeric', month: 'short' }
      : { dateStyle: 'medium' }),
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/**
 * Submission, review and release as one slim three-part bar with a label
 * and, on its own line, a date under each part, so a narrow phone wraps a
 * date instead of clipping it: filled when done, tinted while current.
 * Spans only: it sits inside the row's button, which allows phrasing
 * content.
 */
export function StoreProgress({
  store,
  lang,
  t,
}: {
  store: Store;
  lang: Lang;
  t: Messages['storeReleases'];
}) {
  const date = storeDate(lang, 'short');
  return (
    <span className="grid grid-cols-3 gap-1.5">
      {releaseSteps(store.release).map((step) => {
        const when = step.at ? date.format(new Date(step.at)) : null;
        return (
          <span key={step.id} className="grid min-w-0 gap-1">
            <span className="block h-1 overflow-hidden rounded-full bg-border">
              <span
                className={`block h-full rounded-full ${BAR[step.state]}`}
              />
            </span>
            <span className="grid gap-0.5 text-muted-foreground text-xs tabular-nums">
              <span>
                <span className="sr-only">
                  {t.stepStates[step.state]}
                  {': '}
                </span>
                {t.steps[step.id]}
              </span>
              {when && (
                <span className={step.planned ? '' : 'text-foreground'}>
                  {step.planned ? fill(t.stepTarget, { date: when }) : when}
                </span>
              )}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** The five release dates as a vertical timeline; targets are dashed. */
export function StoreTimeline({
  store,
  lang,
  t,
}: {
  store: Store;
  lang: Lang;
  t: Messages['storeReleases'];
}) {
  const date = storeDate(lang);
  return (
    <ol className="grid">
      {FIELDS.map((field, index) => {
        const value = store.release[field];
        const target = field.startsWith('target');
        const reached = Boolean(value) && !target;
        return (
          <li
            key={field}
            className="relative grid grid-cols-[1.375rem_minmax(0,1fr)_auto] items-start gap-3 pb-4 last:pb-0"
          >
            {index < FIELDS.length - 1 && (
              <span
                aria-hidden
                className="absolute top-6 bottom-0 left-[0.625rem] w-0.5 bg-border"
              />
            )}
            <span
              aria-hidden
              className={`grid size-5.5 place-items-center rounded-full border-2 bg-card ${
                reached
                  ? 'border-dynamic-green bg-dynamic-green text-background'
                  : target
                    ? 'border-dynamic-purple border-dashed'
                    : 'border-border'
              }`}
            >
              {reached && <Check size={12} />}
            </span>
            <span className="font-medium text-sm">{t.dates[field]}</span>
            {value ? (
              <time
                dateTime={value}
                className="text-muted-foreground text-sm tabular-nums"
              >
                {date.format(new Date(value))}
              </time>
            ) : (
              <span className="text-muted-foreground text-sm">{t.pending}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
