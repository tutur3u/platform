'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from '@tuturuuu/icons';
import { updateWorkspaceCourseTest } from '@tuturuuu/internal-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface CourseEditTestDialogProps {
  courseId: string;
  wsId: string;
  test: {
    id: string;
    name: string;
    start_at: string | null;
    duration_in_minutes: number | null;
    description: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateTimeLocal(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function CourseEditTestDialog({
  courseId,
  wsId,
  test,
  open,
  onOpenChange,
}: CourseEditTestDialogProps) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [testName, setTestName] = useState(test.name);
  const [startAt, setStartAt] = useState(formatDateTimeLocal(test.start_at));
  const [durationInMinutes, setDurationInMinutes] = useState(
    test.duration_in_minutes ? String(test.duration_in_minutes) : '60'
  );
  const [description, setDescription] = useState(test.description || '');

  // Reset form states when test props change or on open
  useEffect(() => {
    if (open && test) {
      setTestName(test.name);
      setStartAt(formatDateTimeLocal(test.start_at));
      setDurationInMinutes(
        test.duration_in_minutes ? String(test.duration_in_minutes) : '60'
      );
      setDescription(test.description || '');
    }
  }, [open, test]);

  const updateTestMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name?: string;
      startAt?: string | null;
      durationInMinutes?: number | null;
      description?: string | null;
    }) => updateWorkspaceCourseTest(wsId, courseId, payload),
    onSuccess: () => {
      toast.success(t('teachModules.testUpdated'));
      qc.invalidateQueries({ queryKey: ['course-tests', wsId, courseId] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('teachModules.testUpdateError')
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!testName.trim()) {
      toast.error(t('teachModules.testNameRequired'));
      return;
    }

    let parsedStartAt: string | null = null;
    if (startAt) {
      const parsedDate = new Date(startAt);
      if (Number.isNaN(parsedDate.getTime())) {
        toast.error(t('teachModules.invalidStartTime'));
        return;
      }
      if (parsedDate < new Date()) {
        toast.error(t('teachModules.startTimeInPast'));
        return;
      }
      parsedStartAt = parsedDate.toISOString();
    }

    let parsedDuration: number | null = null;
    if (durationInMinutes) {
      const durationVal = parseInt(durationInMinutes, 10);
      if (Number.isNaN(durationVal) || durationVal < 1 || durationVal > 1440) {
        toast.error(t('teachModules.invalidDuration'));
        return;
      }
      parsedDuration = durationVal;
    }

    updateTestMutation.mutate({
      id: test.id,
      name: testName.trim(),
      startAt: parsedStartAt,
      durationInMinutes: parsedDuration,
      description: description.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-left">
              <DialogTitle>{t('teachModules.editTest')}</DialogTitle>
              <DialogDescription>
                {t('teachModules.editTestDescription')}
              </DialogDescription>
            </div>

            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-background shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              onClick={() => onOpenChange(false)}
              type="button"
              aria-label={t('common.close') || 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="edit-test-name-input"
              className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
            >
              {t('teachModules.testName')}
            </label>
            <input
              id="edit-test-name-input"
              className="w-full border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
              placeholder={
                t('teachModules.testNamePlaceholder') || 'e.g. Midterm Exam'
              }
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              disabled={updateTestMutation.isPending}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="edit-test-start-at"
                className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
              >
                {t('teachModules.testStartAt')}
              </label>
              <input
                id="edit-test-start-at"
                type="datetime-local"
                className="w-full border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                disabled={updateTestMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="edit-test-duration"
                className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
              >
                {t('teachModules.testDuration')}
              </label>
              <input
                id="edit-test-duration"
                type="number"
                min="1"
                max="1440"
                className="w-full border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
                placeholder={t('teachModules.testDurationPlaceholder')}
                value={durationInMinutes}
                onChange={(e) => setDurationInMinutes(e.target.value)}
                disabled={updateTestMutation.isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="edit-test-description-input"
              className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
            >
              {t('teachModules.testDescription')}
            </label>
            <textarea
              id="edit-test-description-input"
              rows={3}
              className="w-full resize-none border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
              placeholder={t('teachModules.testDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={updateTestMutation.isPending}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              className="border-2 border-border bg-card px-4 py-2 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              onClick={() => onOpenChange(false)}
              type="button"
              disabled={updateTestMutation.isPending}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              className="inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
              type="submit"
              disabled={updateTestMutation.isPending || !testName.trim()}
            >
              {updateTestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.saving') || 'Saving...'}
                </>
              ) : (
                t('common.save') || 'Save'
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
