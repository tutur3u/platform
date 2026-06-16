'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Loader2, X } from '@tuturuuu/icons';
import { createWorkspaceCourseTest } from '@tuturuuu/internal-api';
import type { WorkspaceCourseModule } from '@tuturuuu/types/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CourseTestDialogProps {
  courseId: string;
  wsId: string;
  modules: WorkspaceCourseModule[];
}

export function CourseTestDialog({
  courseId,
  wsId,
  modules,
}: CourseTestDialogProps) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [testName, setTestName] = useState('');
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState('');
  const [durationInMinutes, setDurationInMinutes] = useState('60');
  const [description, setDescription] = useState('');

  const resetForm = () => {
    setTestName('');
    setSelectedModuleIds([]);
    setStartAt('');
    setDurationInMinutes('60');
    setDescription('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    setOpen(nextOpen);
  };

  const createTestMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      moduleIds: string[];
      startAt?: string | null;
      durationInMinutes?: number | null;
      description?: string | null;
    }) => createWorkspaceCourseTest(wsId, courseId, payload),
    onSuccess: () => {
      toast.success(t('teachModules.testCreated'));
      qc.invalidateQueries({ queryKey: ['course-tests', wsId, courseId] });
      resetForm();
      setOpen(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('teachModules.testSaveError')
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testName.trim()) {
      toast.error(t('teachModules.testNameRequired'));
      return;
    }
    if (selectedModuleIds.length === 0) {
      toast.error(t('teachModules.selectModules'));
      return;
    }
    createTestMutation.mutate({
      name: testName.trim(),
      moduleIds: selectedModuleIds,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      durationInMinutes: durationInMinutes
        ? parseInt(durationInMinutes, 10)
        : null,
      description: description.trim() || null,
    });
  };

  const handleToggleModule = (moduleId: string) => {
    setSelectedModuleIds((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-2 border-2 border-border bg-dynamic-cyan/15 px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
          type="button"
        >
          <ClipboardCheck className="h-4 w-4" />
          {t('teachModules.createTest')}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-left">
              <DialogTitle>{t('teachModules.createTest')}</DialogTitle>
              <DialogDescription>
                {t('teachModules.createTestDescription')}
              </DialogDescription>
            </div>

            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-background shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              onClick={() => handleOpenChange(false)}
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
              htmlFor="test-name-input"
              className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
            >
              {t('teachModules.testName')}
            </label>
            <input
              id="test-name-input"
              className="w-full border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
              placeholder={
                t('teachModules.testNamePlaceholder') || 'e.g. Midterm Exam'
              }
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              disabled={createTestMutation.isPending}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="test-start-at"
                className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
              >
                {t('teachModules.testStartAt')}
              </label>
              <input
                id="test-start-at"
                type="datetime-local"
                className="w-full border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                disabled={createTestMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="test-duration"
                className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
              >
                {t('teachModules.testDuration')}
              </label>
              <input
                id="test-duration"
                type="number"
                min="1"
                max="1440"
                className="w-full border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
                placeholder={t('teachModules.testDurationPlaceholder')}
                value={durationInMinutes}
                onChange={(e) => setDurationInMinutes(e.target.value)}
                disabled={createTestMutation.isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="test-description-input"
              className="block font-black text-muted-foreground text-xs uppercase tracking-wider"
            >
              {t('teachModules.testDescription')}
            </label>
            <textarea
              id="test-description-input"
              rows={3}
              className="w-full resize-none border-2 border-border bg-background px-3 py-2 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
              placeholder={t('teachModules.testDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={createTestMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <span className="block font-black text-muted-foreground text-xs uppercase tracking-wider">
              {t('teachModules.selectModules')}
            </span>

            {modules.length === 0 ? (
              <div className="border-2 border-border border-dashed p-4 text-center text-muted-foreground text-sm">
                {t('teachModules.noModulesInGroup')}
              </div>
            ) : (
              <div className="max-h-[200px] space-y-2.5 overflow-y-auto border-2 border-border bg-muted/20 p-3">
                {modules.map((m) => {
                  const isChecked = selectedModuleIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex cursor-pointer select-none items-center gap-2.5 font-bold text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleModule(m.id)}
                        disabled={createTestMutation.isPending}
                        className="h-4 w-4 cursor-pointer border-2 border-border accent-primary shadow-[1px_1px_0_var(--border)] focus:ring-0"
                      />
                      <span>{m.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              className="border-2 border-border bg-card px-4 py-2 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              onClick={() => setOpen(false)}
              type="button"
              disabled={createTestMutation.isPending}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              className="inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] disabled:opacity-50"
              type="submit"
              disabled={
                createTestMutation.isPending ||
                !testName.trim() ||
                selectedModuleIds.length === 0
              }
            >
              {createTestMutation.isPending ? (
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
