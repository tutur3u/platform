'use client';

import { useQuery } from '@tanstack/react-query';
import { learnerProgressRoutesEnabled } from '@tuturuuu/education-core/education/lms-rollout';
import { getClassTuition } from '@tuturuuu/internal-api/finance-class-tuition';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useNow, useTranslations } from 'next-intl';
import { useState } from 'react';

export function LearnerClassTuition({
  classId,
  studentId,
  wsId,
}: {
  classId: string;
  studentId: string | null;
  wsId: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('classTuition');
  const now = useNow();
  const month = new Intl.DateTimeFormat('sv-SE', {
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(now);
  const enabled = learnerProgressRoutesEnabled();
  const tuition = useQuery({
    enabled: enabled && open,
    queryFn: () =>
      getClassTuition(wsId, classId, { month, view: 'learning', studentId }),
    queryKey: ['class-tuition', wsId, classId, 'learning', studentId, month],
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!enabled) return null;

  const status = tuition.isSuccess ? tuition.data.data[0]?.status : undefined;
  return (
    <section
      className="space-y-2 rounded-lg border border-border bg-card p-4"
      aria-label={t('title')}
    >
      <Button
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        variant="outline"
      >
        {t('title')}
      </Button>
      {open && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-muted-foreground">{t('month', { month })}</span>
          {tuition.isPending && <Skeleton className="h-5 w-24" />}
          {tuition.isError && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void tuition.refetch()}
            >
              {t('retry')}
            </Button>
          )}
          {status && <Badge variant="secondary">{t(status)}</Badge>}
        </div>
      )}
    </section>
  );
}
