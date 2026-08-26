import type { FormStudioInput } from '../../schema';

export interface ThreePaneSelection {
  sectionIndex: number;
  questionIndex: number;
  /**
   * The block to edit, or `null` when nothing resolves. Never a best guess:
   * the properties pane binds react-hook-form to
   * `sections.<i>.questions.<j>`, so falling back to index 0 would silently
   * edit a different block than the one highlighted.
   */
  questionId: string | null;
  sectionId: string;
}

/**
 * Resolves the outline/canvas selection into the indices the properties pane
 * binds to.
 *
 * Selection is stored as ids (`activeSectionId`, and a question id per
 * section), but react-hook-form addresses fields by index. Everything that can
 * go wrong lives in that translation: an id that no longer exists after a
 * delete, a section whose question id belongs to a different section, or a
 * selection made before the form loaded.
 */
export function resolveThreePaneSelection(
  sections: FormStudioInput['sections'],
  activeSectionId: string,
  activeQuestionIdsBySection: Record<string, string>
): ThreePaneSelection {
  const sectionIndex = sections.findIndex(
    (section) => section.id === activeSectionId
  );
  const section = sectionIndex >= 0 ? sections[sectionIndex] : undefined;

  if (!section) {
    return {
      sectionIndex: 0,
      questionIndex: 0,
      questionId: null,
      sectionId: '',
    };
  }

  const activeQuestionId = activeQuestionIdsBySection[activeSectionId] ?? '';
  const questionIndex = section.questions.findIndex(
    (question) => question.id === activeQuestionId
  );

  return {
    sectionIndex,
    // The indices are clamped so the pane can still bind to a valid path when
    // nothing is selected, but `questionId` stays null so it renders the empty
    // state instead of editing whatever sits at index 0.
    questionIndex: Math.max(questionIndex, 0),
    questionId: questionIndex >= 0 ? activeQuestionId : null,
    sectionId: section.id ?? '',
  };
}

/**
 * Applies a new question order to one section.
 *
 * Returns `null` when the requested order does not describe exactly the same
 * set of questions — a drop that lost or duplicated an entry must not be
 * written, because silently dropping a question is far worse than ignoring
 * the drag that caused it.
 */
export function reorderSectionQuestions<T extends { id?: string | undefined }>(
  questions: readonly T[],
  order: readonly string[]
): T[] | null {
  const byId = new Map(
    questions.map((question) => [question.id ?? '', question])
  );
  const seen = new Set<string>();
  const reordered: T[] = [];

  for (const id of order) {
    if (seen.has(id)) return null;
    const question = byId.get(id);
    if (!question) return null;

    seen.add(id);
    reordered.push(question);
  }

  return reordered.length === questions.length ? reordered : null;
}
