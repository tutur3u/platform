'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from '@tuturuuu/icons';
import {
  createWorkspaceCourseIndicator,
  listWorkspaceCourseIndicators,
  listWorkspaceCourseMembers,
  updateWorkspaceCourseIndicators,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LEARN_APP_URL } from '@/constants/common';

export function MetricsPanel({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachOperations');
  const queryClient = useQueryClient();
  const [metricName, setMetricName] = useState('');
  const [metricUnit, setMetricUnit] = useState('');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const membersQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseMembers(wsId, courseId),
    queryKey: ['teach-course-members', wsId, courseId],
  });
  const indicatorsQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseIndicators(wsId, courseId),
    queryKey: ['teach-indicators', wsId, courseId],
  });
  const createIndicator = useMutation({
    mutationFn: () =>
      createWorkspaceCourseIndicator(wsId, courseId, {
        name: metricName.trim(),
        unit: metricUnit.trim(),
      }),
    onSuccess: () => {
      setMetricName('');
      setMetricUnit('');
      queryClient.invalidateQueries({
        queryKey: ['teach-indicators', wsId, courseId],
      });
    },
  });
  const saveValues = useMutation({
    mutationFn: () =>
      updateWorkspaceCourseIndicators(
        wsId,
        courseId,
        Object.entries(draftValues).map(([key, value]) => {
          const [user_id, indicator_id] = key.split(':');
          return {
            indicator_id: indicator_id ?? '',
            user_id: user_id ?? '',
            value: value.trim() ? Number(value) : null,
          };
        })
      ),
    onSuccess: () => {
      setDraftValues({});
      queryClient.invalidateQueries({
        queryKey: ['teach-indicators', wsId, courseId],
      });
    },
  });

  const valuesByKey = new Map(
    (indicatorsQuery.data?.values ?? []).map((value) => [
      `${value.user_id}:${value.indicator_id}`,
      value.value,
    ])
  );
  const savedValues = (indicatorsQuery.data?.values ?? []).filter(
    (value) => typeof value.value === 'number'
  );
  const averageScore = savedValues.length
    ? Math.round(
        savedValues.reduce((sum, value) => sum + (value.value ?? 0), 0) /
          savedValues.length
      )
    : null;
  const learnMarksUrl = `${LEARN_APP_URL}/${wsId}/marks`;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        <MetricSummary
          label={t('metricsCount')}
          value={indicatorsQuery.data?.indicators.length ?? 0}
        />
        <MetricSummary label={t('savedValues')} value={savedValues.length} />
        <MetricSummary label={t('averageScore')} value={averageScore ?? '-'} />
        <Button asChild className="h-full min-h-14" variant="outline">
          <a href={learnMarksUrl} rel="noreferrer" target="_blank">
            <ExternalLink className="h-4 w-4" />
            {t('openLearnMarks')}
          </a>
        </Button>
      </div>

      <div className="grid gap-3 border-2 border-border bg-card p-4 shadow-[3px_3px_0_var(--border)] md:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <input
          className="h-11 border-2 border-border bg-background px-3 font-bold outline-none focus:border-primary"
          onChange={(event) => setMetricName(event.target.value)}
          placeholder={t('metricName')}
          value={metricName}
        />
        <input
          className="h-11 border-2 border-border bg-background px-3 outline-none focus:border-primary"
          onChange={(event) => setMetricUnit(event.target.value)}
          placeholder={t('metricUnit')}
          value={metricUnit}
        />
        <button
          className="h-11 border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] disabled:opacity-60"
          disabled={createIndicator.isPending || !metricName.trim()}
          onClick={() => createIndicator.mutate()}
          type="button"
        >
          {createIndicator.isPending ? t('saving') : t('createMetric')}
        </button>
      </div>

      <div className="overflow-x-auto border-2 border-border bg-background shadow-[5px_5px_0_var(--border)]">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-border border-b-2 bg-muted/60">
              <th className="p-3 text-left font-black">{t('learner')}</th>
              {(indicatorsQuery.data?.indicators ?? []).map((indicator) => (
                <th className="p-3 text-left font-black" key={indicator.id}>
                  {indicator.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(membersQuery.data?.data ?? []).map((member) => (
              <tr className="border-border border-b" key={member.id}>
                <td className="p-3 font-bold">
                  {member.full_name ?? member.display_name ?? member.email}
                </td>
                {(indicatorsQuery.data?.indicators ?? []).map((indicator) => {
                  const key = `${member.id}:${indicator.id}`;
                  const value = draftValues[key] ?? valuesByKey.get(key) ?? '';
                  return (
                    <td className="p-3" key={indicator.id}>
                      <input
                        className="h-10 w-24 border-2 border-border bg-card px-2 outline-none focus:border-primary"
                        onChange={(event) =>
                          setDraftValues((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        type="number"
                        value={value}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="inline-flex h-11 items-center border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] disabled:opacity-60"
        disabled={saveValues.isPending || Object.keys(draftValues).length === 0}
        onClick={() => saveValues.mutate()}
        type="button"
      >
        {saveValues.isPending ? t('saving') : t('saveMetrics')}
      </button>
    </section>
  );
}

function MetricSummary({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="border-2 border-border bg-card p-3 shadow-[2px_2px_0_var(--border)]">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-black text-2xl">{value}</p>
    </div>
  );
}
