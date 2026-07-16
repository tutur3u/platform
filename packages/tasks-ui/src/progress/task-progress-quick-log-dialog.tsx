'use client';

import { useMutation } from '@tanstack/react-query';
import { Sparkles, Trophy } from '@tuturuuu/icons';
import {
  createTaskProgressEntry,
  type TaskProgressMetric,
} from '@tuturuuu/tasks-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import type { Translate } from './task-progress-shared';

const today = () => new Date().toISOString().slice(0, 10);

interface QuickLogProgressDialogProps {
  metrics: TaskProgressMetric[];
  defaultMetricId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
  wsId: string;
  t: Translate;
}

export function QuickLogProgressDialog({
  metrics,
  defaultMetricId,
  open,
  onOpenChange,
  onLogged,
  wsId,
  t,
}: QuickLogProgressDialogProps) {
  const [metricId, setMetricId] = useState(
    defaultMetricId ?? metrics[0]?.id ?? ''
  );
  const [mode, setMode] = useState<'delta' | 'total'>('delta');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');

  const selectedMetric = metrics.find((m) => m.id === metricId) ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      createTaskProgressEntry(wsId, {
        metric_id: metricId,
        value: Number(amount),
        mode,
        entry_date: date,
        note: note.trim() || null,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        source_type: 'manual',
      }),
    onSuccess: (response) => {
      if (response.ok) {
        toast.success(t('quicklog.success'));
        if ((response.newlyUnlocked ?? []).length > 0) {
          toast.success(t('gamification.unlocked_toast'), {
            icon: <Trophy className="size-4 text-dynamic-yellow" />,
          });
        }
        setAmount('');
        setNote('');
        setTags('');
        onLogged();
        onOpenChange(false);
      } else {
        toast.error(t('quicklog.error'));
      }
    },
    onError: () => toast.error(t('quicklog.error')),
  });

  const numericAmount = Number(amount);
  const canSubmit =
    Boolean(metricId) &&
    amount.trim() !== '' &&
    Number.isFinite(numericAmount) &&
    numericAmount !== 0 &&
    !mutation.isPending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-dynamic-cyan" />
            {t('quicklog.title')}
          </DialogTitle>
          <DialogDescription>{t('quicklog.description')}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="quicklog-date">{t('quicklog.date')}</Label>
              <Input
                id="quicklog-date"
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                type="date"
                value={date}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quicklog-metric">{t('quicklog.metric')}</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-dynamic-blue focus:ring-2 focus:ring-dynamic-blue/15"
                id="quicklog-metric"
                onChange={(e) => setMetricId(e.target.value)}
                value={metricId}
              >
                {metrics.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="quicklog-amount">
              {t('quicklog.amount')}
              {selectedMetric ? (
                <span className="ml-1 text-muted-foreground text-xs">
                  ({selectedMetric.unit_label})
                </span>
              ) : null}
            </Label>
            <Input
              id="quicklog-amount"
              inputMode="numeric"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              type="number"
              value={amount}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['delta', 'total'] as const).map((option) => (
              <button
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm transition',
                  mode === option
                    ? 'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue'
                    : 'hover:bg-muted/50'
                )}
                key={option}
                onClick={() => setMode(option)}
                type="button"
              >
                {t(`quicklog.mode_${option}`)}
              </button>
            ))}
          </div>
          <p className="-mt-2 text-muted-foreground text-xs">
            {t(`quicklog.mode_hint_${mode}`)}
          </p>

          <div className="grid gap-1.5">
            <Label htmlFor="quicklog-note">{t('quicklog.note')}</Label>
            <Textarea
              id="quicklog-note"
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('quicklog.note_placeholder')}
              rows={2}
              value={note}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="quicklog-tags">{t('quicklog.tags')}</Label>
            <Input
              id="quicklog-tags"
              onChange={(e) => setTags(e.target.value)}
              placeholder="draft, chapter-3"
              value={tags}
            />
          </div>

          <DialogFooter>
            <Button disabled={!canSubmit} type="submit">
              {t('quicklog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
