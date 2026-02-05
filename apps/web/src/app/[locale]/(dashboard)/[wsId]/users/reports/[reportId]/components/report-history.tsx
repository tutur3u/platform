'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { FileText, History, PencilIcon, Plus } from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useLocale, useTranslations } from 'next-intl';
import type { ReportHistoryEntry } from '../hooks/use-report-history';

export interface SelectedLog {
  id: string;
  title?: string | null;
  content?: string | null;
  feedback?: string | null;
  score?: number | null;
  scores?: number[] | null;
}

interface ReportHistoryProps {
  logsQuery: UseQueryResult<ReportHistoryEntry[]>;
  selectedLog: SelectedLog | null;
  setSelectedLog: (log: SelectedLog | null) => void;
  formatRelativeTime: (dateIso?: string) => string;
}

export function ReportHistory({
  logsQuery,
  selectedLog,
  setSelectedLog,
  formatRelativeTime,
}: ReportHistoryProps) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <Accordion type="single" collapsible className="rounded-lg border">
      <AccordionItem value="history" className="border-none">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="mr-2 flex w-full items-center justify-between">
            <div className="flex flex-row items-center gap-2 font-semibold text-lg">
              <History className="h-4 w-4" />
              {t('ws-reports.history')}
            </div>
            {logsQuery.data && (
              <div className="text-xs opacity-70">
                {logsQuery.data.length} {t('common.history')}
              </div>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-4">
          {logsQuery.isLoading ? (
            <div className="text-sm opacity-70">{t('common.loading')}</div>
          ) : logsQuery.data && logsQuery.data.length > 0 ? (
            <div className="space-y-6">
              {logsQuery.data.map((log, idx) => {
                const isLatest = idx === 0;
                const isOldest = idx === logsQuery.data!.length - 1;
                const actionLabel = isOldest
                  ? t('ws-reports.created_report')
                  : t('ws-reports.updated_report');
                const label = isLatest
                  ? t('ws-reports.current_version')
                  : t('ws-reports.updated_report-number', {
                      number: logsQuery.data!.length - idx,
                    });
                const exact = new Date(log.created_at).toLocaleString(locale);
                const relative = formatRelativeTime(log.created_at);

                const IconComponent = isLatest
                  ? FileText
                  : isOldest
                    ? Plus
                    : PencilIcon;
                const bgColor = isLatest
                  ? 'bg-dynamic-blue'
                  : isOldest
                    ? 'bg-dynamic-green'
                    : 'bg-dynamic-orange';
                const iconColor = 'text-background';

                const isSelected = selectedLog?.id === log.id;

                return (
                  <div key={log.id} className="relative">
                    <button
                      type="button"
                      className="flex w-full cursor-pointer gap-4 text-left"
                      onClick={() =>
                        setSelectedLog(
                          selectedLog?.id === log.id
                            ? null
                            : {
                                id: log.id,
                                title: log.title,
                                content: log.content,
                                feedback: log.feedback,
                                score: log.score ?? null,
                                scores: (log.scores as number[]) ?? null,
                              }
                        )
                      }
                      aria-pressed={isSelected}
                    >
                      <div className="relative shrink-0">
                        {idx < logsQuery.data!.length - 1 && (
                          <div
                            className="absolute left-1/2 w-px bg-muted-foreground/30"
                            style={{
                              transform: 'translateX(-0.5px)',
                              top: '32px',
                              height: 'calc(100% + 24px)',
                            }}
                          />
                        )}
                        <div
                          className={`h-8 w-8 rounded-full ${bgColor} relative z-10 flex items-center justify-center`}
                        >
                          <IconComponent className={`h-4 w-4 ${iconColor}`} />
                        </div>
                      </div>

                      <div className="flex-1 space-y-2">
                        <div
                          className={`rounded-lg border bg-card p-3 ${isSelected ? 'ring-2 ring-dynamic-blue' : ''}`}
                        >
                          <div className="font-semibold text-sm">{label}</div>
                          <div className="text-muted-foreground text-sm">
                            {log.creator_name || t('common.unknown')}{' '}
                            {actionLabel}.
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <span>{exact}</span>
                          {relative && (
                            <>
                              <span>•</span>
                              <span>{relative}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm opacity-70">
              {t('ws-reports.no_history')}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
