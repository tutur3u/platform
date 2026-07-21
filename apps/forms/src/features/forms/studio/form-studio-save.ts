'use client';

import type { DragEndEvent } from '@dnd-kit/core';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import type { FormStudioInput } from '../schema';
import { findFirstValidationError } from './form-studio-constants';
import type { FormStudioState } from './form-studio-state';
import {
  ensureIdentifiers,
  sanitizeFormStudioPayloadForSave,
} from './studio-utils';

export function useFormStudioSave({
  t,
  form,
  mode,
  pathname,
  router,
  saveMutation,
  workspaceSlug,
  values,
  isDirty,
  sectionsArray,
  autosaveEnabled,
  autosaveStatus,
  setAutosaveStatus,
  autosaveScheduledAt,
  setAutosaveScheduledAt,
  setSecondsUntilAutosave,
  primarySaveButtonRef,
  setShowFloatingSave,
}: {
  t: FormStudioState['t'];
  form: FormStudioState['form'];
  mode: 'create' | 'edit';
  pathname: FormStudioState['pathname'];
  router: FormStudioState['router'];
  saveMutation: FormStudioState['saveMutation'];
  workspaceSlug: string;
  values: FormStudioState['values'];
  isDirty: FormStudioState['isDirty'];
  sectionsArray: FormStudioState['sectionsArray'];
  autosaveEnabled: FormStudioState['autosaveEnabled'];
  autosaveStatus: FormStudioState['autosaveStatus'];
  setAutosaveStatus: FormStudioState['setAutosaveStatus'];
  autosaveScheduledAt: FormStudioState['autosaveScheduledAt'];
  setAutosaveScheduledAt: FormStudioState['setAutosaveScheduledAt'];
  setSecondsUntilAutosave: FormStudioState['setSecondsUntilAutosave'];
  primarySaveButtonRef: FormStudioState['primarySaveButtonRef'];
  setShowFloatingSave: FormStudioState['setShowFloatingSave'];
}) {
  const getSaveValidationMessage = (
    error: ReturnType<typeof findFirstValidationError>
  ) => {
    if (!error) {
      return t('toast.fix_validation_errors');
    }

    const [root, sectionIndexRaw, child, questionIndexRaw, nestedChild] =
      error.path;
    const section = Number(sectionIndexRaw) + 1;
    const question = Number(questionIndexRaw) + 1;

    if (root === 'title') {
      return t('toast.form_title_required');
    }

    if (
      root === 'sections' &&
      child === 'questions' &&
      nestedChild === 'title' &&
      Number.isFinite(section) &&
      Number.isFinite(question)
    ) {
      return t('toast.question_title_required', {
        section,
        question,
      });
    }

    if (
      root === 'sections' &&
      child === 'questions' &&
      nestedChild === 'options' &&
      Number.isFinite(section) &&
      Number.isFinite(question)
    ) {
      return t('toast.option_label_required', {
        section,
        question,
      });
    }

    if (root === 'logicRules' && error.path.includes('comparisonValue')) {
      return t('toast.logic_rule_value_required');
    }

    if (root === 'logicRules' && error.path.includes('sourceQuestionId')) {
      return t('toast.logic_rule_question_required');
    }

    if (root === 'logicRules' && error.path.includes('targetSectionId')) {
      return t('toast.logic_rule_target_required');
    }

    if (root === 'sections' && child === 'questions') {
      return t('toast.section_needs_question', {
        section,
      });
    }

    return error.message ?? t('toast.fix_validation_errors');
  };

  const performSave = useCallback(
    async (payload: FormStudioInput, isAutosave: boolean) => {
      const sanitizedPayload = sanitizeFormStudioPayloadForSave(payload);
      const normalizedPayload = ensureIdentifiers(sanitizedPayload);
      const variables = isAutosave
        ? { payload: normalizedPayload, isAutosave: true }
        : normalizedPayload;
      const result = await saveMutation.mutateAsync(variables);

      if (mode === 'create' && result?.id) {
        const nextPath = pathname.endsWith('/new')
          ? `${pathname.slice(0, -4)}/${result.id}`
          : `/${workspaceSlug}/forms/${result.id}`;
        router.replace(nextPath);
        return;
      }

      if (!isAutosave) {
        form.reset(normalizedPayload, { keepValues: true });
      }
      return result;
    },
    [form, mode, pathname, router, saveMutation, workspaceSlug]
  );

  const handleSave = form.handleSubmit(
    async (payload) => {
      try {
        await performSave(payload, false);
      } catch {
        return;
      }
    },
    (errors) => {
      const firstError = findFirstValidationError(errors);
      toast.error(getSaveValidationMessage(firstError));
    }
  );

  const performAutosave = useDebouncedCallback(async () => {
    if (!form.formState.isDirty || saveMutation.isPending) {
      return;
    }
    setAutosaveScheduledAt(null);
    const valid = await form.trigger();
    if (!valid) {
      return;
    }
    const payload = form.getValues();
    setAutosaveStatus('saving');
    try {
      await performSave(payload, true);
      setAutosaveStatus('saved');
    } catch {
      setAutosaveStatus('error');
    }
  }, 2000);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state setters are passed in as stable props of the studio state hook
  useEffect(() => {
    if (!autosaveEnabled) {
      setAutosaveScheduledAt(null);
      performAutosave.cancel();
      return;
    }

    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: () => {
        if (!form.formState.isDirty || saveMutation.isPending) {
          return;
        }
        setAutosaveStatus('idle');
        setAutosaveScheduledAt(Date.now() + 2000);
        performAutosave();
      },
    });

    return () => {
      unsubscribe();
      performAutosave.cancel();
      setAutosaveScheduledAt(null);
    };
  }, [autosaveEnabled, form, performAutosave, saveMutation.isPending]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state setters are passed in as stable props of the studio state hook
  useEffect(() => {
    if (!autosaveEnabled || !form.formState.isDirty) {
      setAutosaveScheduledAt(null);
      performAutosave.cancel();
    }
  }, [autosaveEnabled, form.formState.isDirty, performAutosave]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state setters are passed in as stable props of the studio state hook
  useEffect(() => {
    if (!autosaveScheduledAt) {
      setSecondsUntilAutosave(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((autosaveScheduledAt - Date.now()) / 1000)
      );
      setSecondsUntilAutosave(remaining);
      if (remaining <= 0) {
        setAutosaveScheduledAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [autosaveScheduledAt]);

  const saveButtonDisabled =
    saveMutation.isPending ||
    (mode === 'edit' && (!isDirty || autosaveStatus === 'saved'));

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sectionsArray.fields.findIndex(
      (_field, sectionIndex) =>
        (values.sections[sectionIndex]?.id ??
          sectionsArray.fields[sectionIndex]?.id) === active.id
    );
    const newIndex = sectionsArray.fields.findIndex(
      (_field, sectionIndex) =>
        (values.sections[sectionIndex]?.id ??
          sectionsArray.fields[sectionIndex]?.id) === over.id
    );

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }

    sectionsArray.move(oldIndex, newIndex);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the ref and state setter are passed in as stable props of the studio state hook
  useEffect(() => {
    const saveButton = primarySaveButtonRef.current;
    if (!saveButton) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingSave(!entry?.isIntersecting);
      },
      {
        threshold: 0.9,
      }
    );

    observer.observe(saveButton);

    return () => observer.disconnect();
  }, []);

  return {
    handleSave,
    saveButtonDisabled,
    handleSectionDragEnd,
  };
}
