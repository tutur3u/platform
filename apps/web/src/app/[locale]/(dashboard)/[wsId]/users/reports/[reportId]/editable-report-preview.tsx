'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUserReport } from '@tuturuuu/types/db';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import * as z from 'zod';
import { FileText, Plus, PencilIcon, History } from '@tuturuuu/ui/icons';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import UserReportForm from './form';

export const UserReportFormSchema = z.object({
  title: z.string(),
  content: z.string(),
  feedback: z.string(),
});

export default function EditableReportPreview({
  wsId,
  report,
  configs,
  isNew,
}: {
  wsId: string;
  report: Partial<WorkspaceUserReport> & {
    user_name?: string;
    creator_name?: string;
    group_name?: string;
  };
  configs: WorkspaceConfig[];
  isNew: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const supabase = createClient();

  const form = useForm({
    resolver: zodResolver(UserReportFormSchema),
    defaultValues: {
      title: report?.title || '',
      content: report?.content || '',
      feedback: report?.feedback || '',
    },
  });

  // Ensure form reflects the latest report when switching user/report selections
  useEffect(() => {
    form.reset({
      title: report?.title || '',
      content: report?.content || '',
      feedback: report?.feedback || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, report?.title, report?.content, report?.feedback]);

  const title = form.watch('title');
  const content = form.watch('content');
  const feedback = form.watch('feedback');

  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    // Split the text into segments of dynamic keys and plain text
    const segments = text.split(/({{.*?}})/g).filter(Boolean);

    // Map over the segments, converting dynamic keys into <span> elements
    const parsedText = segments.map((segment, index) => {
      const match = segment.match(/{{(.*?)}}/);
      if (match) {
        const key = match?.[1]?.trim() || '';

        if (key === 'user_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.user_name || '...'}
            </span>
          );
        }

        if (key === 'group_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.group_name || '...'}
            </span>
          );
        }

        if (key === 'group_manager_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.creator_name || '...'}
            </span>
          );
        }

        return (
          <span
            key={key + index}
            className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
          >
            {key}
          </span>
        );
      }
      return segment;
    });

    return parsedText;
  };

  // Logs timeline
  const logsQuery = useQuery({
    queryKey: ['ws', wsId, 'report', report?.id, 'logs'],
    enabled: Boolean(report?.id) && !isNew,
    queryFn: async (): Promise<
      Array<{
        id: string;
        created_at: string;
        creator_name?: string | null;
      }>
    > => {
      const { data, error } = await supabase
        .from('external_user_monthly_report_logs')
        .select('id, created_at, creator:workspace_users!creator_id(full_name)')
        .eq('report_id', report?.id as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (
        (data ?? []).map((raw) => ({
          id: raw.id,
          created_at: raw.created_at,
          creator_name: Array.isArray(raw.creator)
            ? raw.creator?.[0]?.full_name
            : raw.creator?.full_name,
        })) as Array<{ id: string; created_at: string; creator_name?: string | null }>
      );
    },
  });

  const formatRelativeTime = (dateIso?: string) => {
    if (!dateIso) return '';
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const now = new Date();
    const then = new Date(dateIso);
    const diffMs = then.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const minutes = Math.round(absMs / (60 * 1000));
    if (minutes < 60) return rtf.format(Math.sign(diffMs) * Math.round(minutes), 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return rtf.format(Math.sign(diffMs) * Math.round(hours), 'hour');
    const days = Math.round(hours / 24);
    if (days < 30) return rtf.format(Math.sign(diffMs) * Math.round(days), 'day');
    const months = Math.round(days / 30);
    if (months < 12) return rtf.format(Math.sign(diffMs) * Math.round(months), 'month');
    const years = Math.round(months / 12);
    return rtf.format(Math.sign(diffMs) * Math.round(years), 'year');
  };

  return (
    <div className="grid h-fit gap-4 xl:grid-cols-2">
      <div className="grid h-fit gap-4">
        {isNew || (
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="font-semibold text-lg">User Data</div>
            <Separator />

            <div>
              {report.scores?.length === 0 ? (
                <div className="text-red-500">No scores data</div>
              ) : (
                <div className="flex items-center gap-1">
                  Average score:
                  <div className="flex flex-wrap gap-1">
                    <div className="flex aspect-square h-8 items-center justify-center overflow-hidden rounded bg-foreground p-1 font-semibold text-background">
                      {(
                        (report?.scores
                          ?.filter((s) => s !== null && s !== undefined)
                          ?.reduce((a, b) => a + b, 0) ?? 0) /
                        (report?.scores?.filter(
                          (s) => s !== null && s !== undefined
                        )?.length ?? 1)
                      )?.toPrecision(2) || '-'}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div>
              {report.scores?.length === 0 ? (
                <div className="text-red-500">No scores data</div>
              ) : (
                <div className="flex items-center gap-1">
                  Scores:
                  <div className="flex flex-wrap gap-1">
                    {report.scores
                      ?.filter((s) => s !== null && s !== undefined)
                      ?.map((s, idx) => (
                        <div
                          key={`report-${report.id}-score-${idx}`}
                          className="flex aspect-square h-8 items-center justify-center overflow-hidden rounded bg-foreground p-1 font-semibold text-background"
                        >
                          {s}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <UserReportForm
          isNew={isNew}
          form={form}
          submitLabel={t('common.save')}
        />

        {/* <div className="grid h-fit gap-2 rounded-lg border p-4">
          <div className="text-lg font-semibold">Report Data</div>
          <Separator />
          <pre className="scrollbar-none overflow-auto">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div> */}

        {report.user_id && (
          <UserMonthAttendance
            wsId={wsId}
            user={{
              id: report.user_id,
              full_name: report.user_name,
              href: `/${wsId}/users/database/${report.user_id}`,
            }}
            defaultIncludedGroups={[report.group_id!]}
          />
        )}
      </div>

      <div className="grid h-fit gap-4">
      {isNew || (
          <Accordion type="single" collapsible className="rounded-lg border">
            <AccordionItem value="history" className="border-none">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center justify-between w-full mr-2">
                  <div className="font-semibold text-lg flex flex-row gap-2 items-center">
                    <History className="w-4 h-4" />
                    History
                  </div>
                  {logsQuery.data && (
                    <div className="text-xs opacity-70">
                      {logsQuery.data.length} entr{logsQuery.data.length === 1 ? 'y' : 'ies'}
                    </div>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {logsQuery.isLoading ? (
                  <div className="text-sm opacity-70">Loading...</div>
                ) : logsQuery.data && logsQuery.data.length > 0 ? (
                  <div className="space-y-6">
                    {logsQuery.data.map((log, idx) => {
                      const isLatest = idx === 0;
                      const isOldest = idx === logsQuery.data!.length - 1;
                      const actionLabel = isOldest ? 'created report' : 'updated report';
                      const label = isLatest ? 'Current version' : `Update #${logsQuery.data!.length - idx}`;
                      const exact = new Date(log.created_at).toLocaleString(locale);
                      const relative = formatRelativeTime(log.created_at);
                      
                      // Choose icon and color based on action type
                      const IconComponent = isLatest ? FileText : isOldest ? Plus : PencilIcon;
                      // Solid background to mask the timeline line; icon uses contrasting text color
                      const bgColor = isLatest ? 'bg-dynamic-blue' : isOldest ? 'bg-dynamic-green' : 'bg-dynamic-orange';
                      const iconColor = 'text-background';
                      
                      return (
                        <div key={log.id} className="relative">
                          {/* Timeline item */}
                          <div className="flex gap-4">
                            {/* Timeline icon container */}
                            <div className="relative flex-shrink-0">
                              {/* Timeline line - only between items, not after the last one */}
                              {idx < logsQuery.data!.length - 1 && (
                                <div
                                  className="absolute left-1/2 w-px bg-muted-foreground/30"
                                  style={{
                                    transform: 'translateX(-0.5px)',
                                    top: '32px', // Start after current circle
                                    height: 'calc(100% + 24px)', // Extend to next item (space-y-6 = 24px)
                                  }}
                                />
                              )}
                              {/* Timeline icon */}
                              <div className={`w-8 h-8 rounded-full ${bgColor} flex items-center justify-center relative z-10`}>
                                <IconComponent className={`w-4 h-4 ${iconColor}`} />
                              </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-2">
                              <div className="bg-card border rounded-lg p-3">
                                <div className="font-semibold text-sm">{label}</div>
                                <div className="text-sm text-muted-foreground">
                                  {log.creator_name || 'Someone'} {actionLabel}.
                                </div>
                              </div>

                              {/* Metadata */}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{exact}</span>
                                {relative && (
                                  <>
                                    <span>•</span>
                                    <span>{relative}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm opacity-70">No history</div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        <ReportPreview
          t={t}
          lang={locale}
          parseDynamicText={parseDynamicText}
          getConfig={getConfig}
          data={{
            title,
            content,
            score: report.score?.toString() || '',
            feedback,
          }}
        />
      </div>
    </div>
  );
}
