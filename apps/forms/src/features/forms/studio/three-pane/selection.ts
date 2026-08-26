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
