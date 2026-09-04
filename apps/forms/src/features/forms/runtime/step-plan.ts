import { isAnswerableQuestionType } from '../block-utils';
import type { FormDefinitionQuestion, FormDefinitionSection } from '../types';

/**
 * Splitting a section into screens.
 *
 * In `sections` mode a section is one screen, which is what the runtime has
 * always done. In `one_question` mode each answerable question gets its own
 * screen — the Typeform shape — and branching still happens at section
 * boundaries, so all the existing rule evaluation is untouched.
 *
 * Content blocks (rich text, images, video, dividers) are not screens of their
 * own: they exist to introduce or illustrate the question they sit above, and
 * stranding them alone would strip that context. Each one is attached to the
 * next answerable question instead, and any trailing content after the last
 * question stays with it.
 */

export type FormDisplayMode = 'sections' | 'one_question';

export interface FormStep {
  /** Questions and content blocks shown together on this screen. */
  questions: FormDefinitionQuestion[];
  /** Ids of the answerable questions on this screen, for validation. */
  answerableQuestionIds: string[];
}

export function buildSectionSteps(
  section: FormDefinitionSection | undefined,
  displayMode: FormDisplayMode
): FormStep[] {
  if (!section) {
    return [];
  }

  const toStep = (questions: FormDefinitionQuestion[]): FormStep => ({
    questions,
    answerableQuestionIds: questions
      .filter((question) => isAnswerableQuestionType(question.type))
      .map((question) => question.id),
  });

  if (displayMode === 'sections') {
    return [toStep(section.questions)];
  }

  const steps: FormStep[] = [];
  let pending: FormDefinitionQuestion[] = [];

  for (const question of section.questions) {
    pending.push(question);

    if (isAnswerableQuestionType(question.type)) {
      steps.push(toStep(pending));
      pending = [];
    }
  }

  // Trailing content with no question after it — a closing note, an image —
  // belongs on the last screen rather than on a screen of its own.
  if (pending.length > 0) {
    const last = steps.at(-1);
    if (last) {
      last.questions.push(...pending);
    } else {
      steps.push(toStep(pending));
    }
  }

  // A section of nothing but content blocks still has to render something.
  return steps.length > 0 ? steps : [toStep(section.questions)];
}

/** Clamps a step index that a branching jump or an edit may have invalidated. */
export function clampStepIndex(stepIndex: number, stepCount: number) {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(stepIndex, 0), stepCount - 1);
}
