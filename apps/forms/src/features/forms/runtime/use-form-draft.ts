'use client';

import { type Dispatch, type SetStateAction, useEffect } from 'react';
import type { FormAnswerValue, FormDefinition } from '../types';

export function useFormDraft({
  draftKey,
  form,
  mode,
  readOnly,
  submittedAt,
  isSubmitting,
  initialAnswers,
  answers,
  answersRef,
  currentSectionId,
  sectionTrail,
  setAnswers,
  setCurrentSectionId,
  setSectionTrail,
}: {
  draftKey: string;
  form: FormDefinition;
  mode: 'preview' | 'public';
  readOnly?: boolean;
  submittedAt?: string | null;
  isSubmitting?: boolean;
  initialAnswers?: Record<string, FormAnswerValue>;
  answers: Record<string, FormAnswerValue>;
  answersRef: { current: Record<string, FormAnswerValue> };
  currentSectionId: string;
  sectionTrail: string[];
  setAnswers: Dispatch<SetStateAction<Record<string, FormAnswerValue>>>;
  setCurrentSectionId: Dispatch<SetStateAction<string>>;
  setSectionTrail: Dispatch<SetStateAction<string[]>>;
}) {
  // Load draft from localStorage on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional run on mount
  useEffect(() => {
    if (mode !== 'public' || readOnly || submittedAt) {
      return;
    }

    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.answers && Object.keys(parsed.answers).length > 0) {
          const mergedAnswers = {
            ...(initialAnswers ?? {}),
            ...parsed.answers,
          };
          setAnswers(mergedAnswers);
          answersRef.current = mergedAnswers;
        }
        if (
          parsed.currentSectionId &&
          form.sections.some((s) => s.id === parsed.currentSectionId)
        ) {
          setCurrentSectionId(parsed.currentSectionId);
        }
        if (parsed.sectionTrail && Array.isArray(parsed.sectionTrail)) {
          const validTrail = parsed.sectionTrail.filter((id: string) =>
            form.sections.some((s) => s.id === id)
          );
          if (validTrail.length > 0) {
            setSectionTrail(validTrail);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load form draft from local storage', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft to localStorage when answers/section changes
  useEffect(() => {
    if (mode !== 'public' || readOnly || submittedAt || isSubmitting) {
      return;
    }

    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          answers,
          currentSectionId,
          sectionTrail,
        })
      );
    } catch (err) {
      console.warn('Failed to save form draft to local storage', err);
    }
  }, [
    answers,
    currentSectionId,
    sectionTrail,
    mode,
    readOnly,
    submittedAt,
    isSubmitting,
    draftKey,
  ]);
}
