'use client';

import UserMonthAttendance from '../../attendance/user-month-attendance';
import UserReportForm from './form';
import { WorkspaceUserReport } from '@tuturuuu/types/db';
import { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { useLocale, useTranslations } from 'next-intl';
import { ReactNode } from 'react';
import * as z from 'zod';

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

  const form = useForm({
    resolver: zodResolver(UserReportFormSchema),
    defaultValues: {
      title: report?.title || '',
      content: report?.content || '',
      feedback: report?.feedback || '',
    },
  });

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
            className="bg-foreground text-background rounded px-1 py-0.5 font-semibold"
          >
            {key}
          </span>
        );
      }
      return segment;
    });

    return parsedText;
  };

  return (
    <div className="grid h-fit gap-4 xl:grid-cols-2">
      <div className="grid h-fit gap-4">
        {isNew || (
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="text-lg font-semibold">User Data</div>
            <Separator />

            <div>
              {report.scores?.length === 0 ? (
                <div className="text-red-500">No scores data</div>
              ) : (
                <div className="flex items-center gap-1">
                  Average score:
                  <div className="flex flex-wrap gap-1">
                    <div className="bg-foreground text-background flex aspect-square h-8 items-center justify-center overflow-hidden rounded p-1 font-semibold">
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
                          className="bg-foreground text-background flex aspect-square h-8 items-center justify-center overflow-hidden rounded p-1 font-semibold"
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
  );
}
