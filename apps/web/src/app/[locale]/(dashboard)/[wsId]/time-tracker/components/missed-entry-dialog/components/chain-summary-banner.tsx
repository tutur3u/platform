import { Coffee } from '@tuturuuu/icons';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { formatDuration } from '@/lib/time-format';
import type { ChainBreak, ChainSession, ChainSummary } from '../types';

interface ChainSummaryBannerProps {
  chainSummary: ChainSummary;
}

export function ChainSummaryBanner({ chainSummary }: ChainSummaryBannerProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');

  return (
    <div className="space-y-4">
      {/* Chain Summary Header */}
      <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-dynamic-orange text-lg">
              {t('exceeded.chainSummaryTitle')}
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('exceeded.chainStarted', {
                time: dayjs(chainSummary.original_start_time).format(
                  'MMM D, YYYY [at] h:mm A'
                ),
              })}
            </p>
          </div>
          <div className="text-right">
            <div className="font-bold text-2xl text-dynamic-orange">
              {chainSummary.chain_length}
            </div>
            <div className="text-muted-foreground text-xs">
              {t('exceeded.sessionsInChain')}
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/20">
            <div className="font-medium text-green-700 text-xs dark:text-green-300">
              {t('exceeded.totalWorkTime')}
            </div>
            <div className="mt-1 font-bold text-green-600 text-xl dark:text-green-400">
              {formatDuration(chainSummary.total_work_seconds)}
            </div>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
            <div className="font-medium text-amber-700 text-xs dark:text-amber-300">
              {t('exceeded.totalBreakTime')}
            </div>
            <div className="mt-1 font-bold text-amber-600 text-xl dark:text-amber-400">
              {formatDuration(chainSummary.total_break_seconds)}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm">{t('exceeded.timeline')}</h4>
        {chainSummary.sessions?.map((sess: ChainSession, idx: number) => {
          const sessionBreaks =
            chainSummary.breaks?.filter(
              (b: ChainBreak) => b.session_id === sess.id
            ) || [];

          return (
            <div key={sess.id} className="space-y-2">
              {/* Work Session */}
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-800 dark:bg-green-950/10">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 font-bold text-white text-xs">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{sess.title}</div>
                  <div className="mt-1 text-muted-foreground text-xs">
                    {dayjs(sess.start_time).format('h:mm A')} →{' '}
                    {dayjs(sess.end_time).format('h:mm A')}
                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                      {formatDuration(sess.duration_seconds)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Breaks after this session */}
              {sessionBreaks.map((brk: ChainBreak) => (
                <div
                  key={brk.id}
                  className="ml-9 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-800 dark:bg-amber-950/10"
                >
                  <Coffee className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      {brk.break_type_icon && (
                        <span className="mr-1">{brk.break_type_icon}</span>
                      )}
                      {brk.break_type_name}
                    </div>
                    <div className="font-medium text-amber-600 text-xs dark:text-amber-400">
                      {formatDuration(brk.break_duration_seconds)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
