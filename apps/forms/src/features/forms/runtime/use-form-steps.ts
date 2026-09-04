'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { FormDefinitionSection } from '../types';
import {
  buildSectionSteps,
  clampStepIndex,
  type FormDisplayMode,
  type FormStep,
} from './step-plan';

export interface UseFormStepsResult {
  /** Screens the current section is split into. */
  steps: FormStep[];
  stepIndex: number;
  currentStep: FormStep | undefined;
  isFirstStep: boolean;
  isLastStep: boolean;
  /** Advances within the section. False when the section is exhausted, in
   *  which case the caller should apply branching and move sections. */
  goToNextStep: () => boolean;
  /** Steps back within the section. False at the first step. */
  goToPreviousStep: () => boolean;
  /** Called by the caller after a section change, to restart the plan. */
  resetSteps: (position?: 'first' | 'last') => void;
}

/**
 * Screen-by-screen navigation inside the current section.
 *
 * Deliberately layered on top of the existing section navigation instead of
 * replacing it: branching rules, validation and progress are all defined per
 * section, so keeping sections as the unit of navigation means one-question
 * mode is a presentational split rather than a second engine to keep in sync.
 */
export function useFormSteps({
  displayMode,
  section,
}: {
  displayMode: FormDisplayMode;
  section: FormDefinitionSection | undefined;
}): UseFormStepsResult {
  // Position is stored with the section it belongs to, and adjusted during
  // render when the section changes. An effect would paint one frame of the
  // wrong screen first, and would also have to lie to the dependency linter:
  // the plan is rebuilt from `section`, but resetting on the `steps` array
  // identity would throw the reader's place away whenever an answer changed a
  // label.
  const [position, setPosition] = useState({ index: 0, sectionId: '' });
  // Tracks whether the next section should open at its first or last screen,
  // so stepping backwards out of a section lands on its final question rather
  // than restarting it.
  const pendingPositionRef = useRef<'first' | 'last'>('first');

  const steps = useMemo(
    () => buildSectionSteps(section, displayMode),
    [displayMode, section]
  );

  const sectionId = section?.id ?? '';

  if (position.sectionId !== sectionId) {
    const entryPosition = pendingPositionRef.current;
    pendingPositionRef.current = 'first';
    setPosition({
      index: entryPosition === 'last' ? Math.max(steps.length - 1, 0) : 0,
      sectionId,
    });
  }

  const stepIndex = position.sectionId === sectionId ? position.index : 0;
  const setStepIndex = useCallback(
    (index: number) => setPosition({ index, sectionId }),
    [sectionId]
  );

  const safeIndex = clampStepIndex(stepIndex, steps.length);

  const goToNextStep = useCallback(() => {
    if (safeIndex >= steps.length - 1) {
      return false;
    }
    setStepIndex(safeIndex + 1);
    return true;
  }, [safeIndex, setStepIndex, steps.length]);

  const goToPreviousStep = useCallback(() => {
    if (safeIndex <= 0) {
      return false;
    }
    setStepIndex(safeIndex - 1);
    return true;
  }, [safeIndex, setStepIndex]);

  const resetSteps = useCallback((position: 'first' | 'last' = 'first') => {
    pendingPositionRef.current = position;
  }, []);

  return {
    currentStep: steps[safeIndex],
    goToNextStep,
    goToPreviousStep,
    isFirstStep: safeIndex <= 0,
    isLastStep: safeIndex >= steps.length - 1,
    resetSteps,
    stepIndex: safeIndex,
    steps,
  };
}
