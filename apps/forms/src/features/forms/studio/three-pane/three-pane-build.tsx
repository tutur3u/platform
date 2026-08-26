'use client';

import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';
import type { FormCollaboratorPresence } from '../../collaboration';
import type { FormQuestionInput } from '../../schema';
import { FloatingBlockToolbar } from '../floating-block-toolbar';
import type { FormStudioState } from '../form-studio-state';
import { duplicateQuestionInput } from '../studio-utils';
import { CanvasPane } from './canvas-pane';
import { OutlinePane } from './outline-pane';
import { PropertiesPane } from './properties-pane';
import {
  insertSectionQuestionAfter,
  moveSectionQuestion,
  removeSectionQuestion,
  reorderSectionQuestions,
  resolveThreePaneSelection,
} from './selection';
import { useStudioBuildLayout } from './use-build-layout';

/**
 * Chooses between the three-pane build layout and the stacked one, and renders
 * the toggle between them.
 *
 * Both are passed as elements rather than rendered together and hidden with
 * CSS: elements are cheap, but mounting two copies of every question editor to
 * hide one of them is not.
 */
export function StudioBuildLayout({
  threePane,
  stacked,
  t,
}: {
  threePane: ReactNode;
  stacked: ReactNode;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { layout, preference, canUseThreePane, setLayout } =
    useStudioBuildLayout();

  return (
    <div className="min-w-0 space-y-3">
      {canUseThreePane ? (
        <div className="flex justify-end">
          <fieldset className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1">
            <legend className="sr-only">{t('studio.build_layout')}</legend>
            {(['stacked', 'three-pane'] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={preference === mode ? 'secondary' : 'ghost'}
                aria-pressed={preference === mode}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setLayout(mode)}
              >
                {t(`studio.build_layout_${mode.replace('-', '_')}`)}
              </Button>
            ))}
          </fieldset>
        </div>
      ) : null}

      {layout === 'three-pane' ? threePane : stacked}
    </div>
  );
}

export function ThreePaneBuild({
  wsId,
  t,
  form,
  values,
  previewDefinition,
  studioToneClasses,
  resolvedActiveSectionId,
  activeQuestionIdsBySection,
  setActiveSectionId,
  setActiveQuestionForSection,
  addSection,
  addBlockToActiveSection,
  getBlockEditors,
  formDetails,
  logicRules,
}: {
  wsId: string;
  t: FormStudioState['t'];
  form: FormStudioState['form'];
  values: FormStudioState['values'];
  previewDefinition: FormStudioState['previewDefinition'];
  studioToneClasses: FormStudioState['studioToneClasses'];
  resolvedActiveSectionId: string;
  activeQuestionIdsBySection: Record<string, string>;
  setActiveSectionId: (sectionId: string) => void;
  setActiveQuestionForSection: (sectionId: string, questionId: string) => void;
  addSection: () => void;
  addBlockToActiveSection: (type: FormQuestionInput['type']) => void;
  getBlockEditors: (blockId: string) => FormCollaboratorPresence[];
  /** The form's own title, description and cover, shared with the stacked layout. */
  formDetails: ReactNode;
  logicRules: ReactNode;
}) {
  const translate = t as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  const selection = resolveThreePaneSelection(
    values.sections,
    resolvedActiveSectionId,
    activeQuestionIdsBySection
  );
  const activeQuestionId =
    activeQuestionIdsBySection[resolvedActiveSectionId] ?? '';

  const selectQuestion = (sectionId: string, questionId: string) => {
    setActiveSectionId(sectionId);
    setActiveQuestionForSection(sectionId, questionId);
  };

  /**
   * Commits a reordered section straight through `setValue` rather than a
   * `useFieldArray`.
   *
   * A field array on `sections.<i>.questions` lives in `SectionEditor`, which
   * only the stacked layout mounts — the two layouts never render together, so
   * there is no array here to desync. Doing this while both were mounted would
   * leave that array's own `fields` state pointing at the old order.
   */
  const reorderQuestions = (sectionIndex: number, order: string[]) => {
    const section = values.sections[sectionIndex];
    if (!section) return;

    const reordered = reorderSectionQuestions(section.questions, order);
    if (!reordered) return;

    form.setValue(`sections.${sectionIndex}.questions`, reordered, {
      shouldDirty: true,
    });
  };

  const sectionQuestions =
    values.sections[selection.sectionIndex]?.questions ?? [];

  /** Writes a new question list for the selected section, or does nothing. */
  const commitQuestions = (next: typeof sectionQuestions | null) => {
    if (!next) return;
    form.setValue(`sections.${selection.sectionIndex}.questions`, next, {
      shouldDirty: true,
    });
  };

  const blockActions = {
    canMoveUp: selection.questionId !== null && selection.questionIndex > 0,
    canMoveDown:
      selection.questionId !== null &&
      selection.questionIndex < sectionQuestions.length - 1,
    onMoveUp: () =>
      commitQuestions(
        moveSectionQuestion(sectionQuestions, selection.questionIndex, -1)
      ),
    onMoveDown: () =>
      commitQuestions(
        moveSectionQuestion(sectionQuestions, selection.questionIndex, 1)
      ),
    onDuplicate: () => {
      const source = sectionQuestions[selection.questionIndex];
      if (!source) return;

      const copy = duplicateQuestionInput(source);
      commitQuestions(
        insertSectionQuestionAfter(
          sectionQuestions,
          selection.questionIndex,
          copy
        )
      );
      // Select the copy, so the author edits what they just made rather than
      // the original they duplicated from.
      selectQuestion(selection.sectionId, copy.id);
    },
    onRemove: () => {
      commitQuestions(
        removeSectionQuestion(sectionQuestions, selection.questionIndex)
      );
      // The deleted id would otherwise stay selected and resolve to nothing.
      setActiveQuestionForSection(selection.sectionId, '');
    },
  };

  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[72px_minmax(200px,240px)_minmax(0,1fr)_minmax(300px,360px)]">
      <FloatingBlockToolbar
        toneClasses={studioToneClasses}
        onAddSection={addSection}
        onAddBlock={addBlockToActiveSection}
      />

      <OutlinePane
        sections={values.sections}
        activeSectionId={resolvedActiveSectionId}
        activeQuestionId={activeQuestionId}
        onSelectSection={setActiveSectionId}
        onSelectQuestion={selectQuestion}
        onReorderQuestions={reorderQuestions}
        onAddSection={addSection}
        getBlockEditors={getBlockEditors}
        t={translate}
      />

      <div className="min-w-0 space-y-6 overflow-y-auto pb-8 xl:max-h-[calc(100vh-9rem)]">
        {formDetails}

        <CanvasPane
          definition={previewDefinition}
          activeSectionId={resolvedActiveSectionId}
          activeQuestionId={activeQuestionId}
          onSelectQuestion={selectQuestion}
          t={translate}
        />

        {logicRules}
      </div>

      <PropertiesPane
        wsId={wsId}
        form={form}
        sectionIndex={selection.sectionIndex}
        questionIndex={selection.questionIndex}
        questionId={selection.questionId}
        sectionId={selection.sectionId}
        actions={blockActions}
        toneClasses={studioToneClasses}
        t={translate}
      />
    </div>
  );
}
