'use client';

import type { WorkspaceUserReport } from '@tuturuuu/types/db';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import ScoreDisplay from '../../reports/[reportId]/score-display';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';

type ReportWithNames = WorkspaceUserReport & {
  group_name: string;
  creator_name?: string | null;
  user_name?: string | null;
};

export default function EmailReportPreview({
  wsId,
  report,
  configs,
  groupId,
  healthcareVitals = [],
  healthcareVitalsLoading = false,
  factorEnabled = false,
  title,
  content,
}: {
  wsId: string;
  report: Partial<ReportWithNames> & {
    user_name?: string;
    creator_name?: string;
    group_name?: string;
  };
  configs: WorkspaceConfig[];
  groupId?: string;
  healthcareVitals?: Array<{
    id: string;
    name: string;
    unit: string;
    factor: number;
    value: number | null;
  }>;
  healthcareVitalsLoading?: boolean;
  factorEnabled?: boolean;
  title: string;
  content: string;
}) {
  const locale = useLocale();

  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';
    
    // Simple dynamic text parsing for common placeholders
    return text
      .replace(/{{user_name}}/g, report.user_name || 'Unknown User')
      .replace(/{{group_name}}/g, report.group_name || 'Unknown Group')
      .replace(/{{date}}/g, new Date().toLocaleDateString())
      .replace(/{{score}}/g, report.score?.toString() || 'N/A');
  };

  const previewTitle = parseDynamicText(title);
  const previewContent = parseDynamicText(content);
  const previewScore = report.score;

  return (
    <div className="space-y-4">
      {/* Report Preview Section - Main Focus */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <ReportPreview
                t={(key: string) => key} // Simple fallback for translations
                lang={locale}
                parseDynamicText={parseDynamicText}
                getConfig={getConfig}
                theme="light"
                data={{
                  title: previewTitle as string,
                  content: previewContent as string,
                  score: previewScore?.toString() ?? '',
                  feedback: '',
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Healthcare Vitals/Scores Section - Compact */}
      {healthcareVitals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreDisplay
              healthcareVitals={healthcareVitals}
              healthcareVitalsLoading={healthcareVitalsLoading}
              factorEnabled={factorEnabled}
              scores={report.scores}
              isNew={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Attendance Section - Compact */}
      {report.user_name && report.user_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto">
              <UserMonthAttendance
                wsId={wsId}
                user={{
                  id: report.user_id,
                  full_name: report.user_name,
                  href: `/${wsId}/users/${report.user_id}`,
                }}
                defaultIncludedGroups={groupId ? [groupId] : undefined}
                noOutline
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
