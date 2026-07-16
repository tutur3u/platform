import { useMutation } from '@tanstack/react-query';
import { BookOpen } from '@tuturuuu/icons';
import {
  applyTaskProgressMetricPack,
  type TaskProgressMetric,
} from '@tuturuuu/tasks-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import type { Translate } from './task-progress-shared';

const WRITING_KINDS = new Set([
  'words',
  'pages',
  'chapters',
  'scenes',
  'lines',
]);

export function TaskProgressWritingPackCard({
  metrics,
  onApplied,
  t,
  wsId,
}: {
  metrics: TaskProgressMetric[];
  onApplied: () => void;
  t: Translate;
  wsId: string;
}) {
  const hasWriting = metrics.some((metric) =>
    WRITING_KINDS.has(metric.unit_kind)
  );

  const mutation = useMutation({
    mutationFn: () => applyTaskProgressMetricPack(wsId, { pack: 'writing' }),
    onSuccess: (response) => {
      if (response.ok) {
        toast.success(t('metrics.writing_enabled'));
        onApplied();
      } else {
        toast.error(t('metrics.writing_error'));
      }
    },
    onError: () => toast.error(t('metrics.writing_error')),
  });

  // Once writing metrics exist, the pack is enabled — hide the prompt.
  if (hasWriting) return null;

  return (
    <Card className="overflow-hidden border-dynamic-purple/30 bg-dynamic-purple/5">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-dynamic-purple/15 text-dynamic-purple">
            <BookOpen className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">{t('metrics.writing_pack_title')}</h3>
            <p className="mt-0.5 text-muted-foreground text-sm">
              {t('metrics.writing_pack_description')}
            </p>
          </div>
        </div>
        <Button
          className="shrink-0"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          type="button"
          variant="outline"
        >
          {t('metrics.enable_writing')}
        </Button>
      </CardContent>
    </Card>
  );
}
