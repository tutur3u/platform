'use client';

import { useCallback } from 'react';

/**
 * Stepping backwards through the form.
 *
 * Screens come before sections: in one-question mode a respondent who presses
 * back expects the previous *question*, not to be thrown over the whole
 * section they are part-way through.
 *
 * A section is only left once its first screen is already showing, and it is
 * re-entered from its end — the last screen is what that respondent last saw,
 * so restarting the section would make back feel like a reset.
 */
export function useBackNavigation({
  isBusy,
  goToPreviousStep,
  resetSteps,
  sectionTrail,
  setCurrentSectionId,
  setError,
  setSectionTrail,
  setStepDirection,
}: {
  isBusy: boolean;
  goToPreviousStep: () => boolean;
  resetSteps: (position?: 'first' | 'last') => void;
  sectionTrail: string[];
  setCurrentSectionId: (sectionId: string) => void;
  setError: (error: string | null) => void;
  setSectionTrail: (update: (trail: string[]) => string[]) => void;
  setStepDirection: (direction: 'forward' | 'backward') => void;
}) {
  return useCallback(() => {
    if (isBusy) return;

    setStepDirection('backward');

    if (goToPreviousStep()) {
      setError(null);
      return;
    }

    const previousSectionId = sectionTrail[sectionTrail.length - 2];
    if (!previousSectionId) return;

    resetSteps('last');
    setSectionTrail((trail) => trail.slice(0, -1));
    setCurrentSectionId(previousSectionId);
    setError(null);
  }, [
    goToPreviousStep,
    isBusy,
    resetSteps,
    sectionTrail,
    setCurrentSectionId,
    setError,
    setSectionTrail,
    setStepDirection,
  ]);
}
