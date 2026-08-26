'use client';

import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';
import type { FormCollaboratorPresence } from '../../collaboration';
import type { FormQuestionInput } from '../../schema';
import { FloatingBlockToolbar } from '../floating-block-toolbar';
import type { FormStudioState } from '../form-studio-state';
import { CanvasPane } from './canvas-pane';
import { OutlinePane } from './outline-pane';
import { PropertiesPane } from './properties-pane';
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
}) {
  const translate = t as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  const activeSectionIndex = values.sections.findIndex(
    (section) => section.id === resolvedActiveSectionId
  );
  const activeSection =
    activeSectionIndex >= 0 ? values.sections[activeSectionIndex] : undefined;
  const activeQuestionId =
    activeQuestionIdsBySection[resolvedActiveSectionId] ?? '';
  const activeQuestionIndex =
    activeSection?.questions.findIndex(
      (question) => question.id === activeQuestionId
    ) ?? -1;

  const selectQuestion = (sectionId: string, questionId: string) => {
    setActiveSectionId(sectionId);
    setActiveQuestionForSection(sectionId, questionId);
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
        onAddSection={addSection}
        getBlockEditors={getBlockEditors}
        t={translate}
      />

      <div className="min-w-0 overflow-y-auto pb-8 xl:max-h-[calc(100vh-9rem)]">
        <CanvasPane
          definition={previewDefinition}
          activeSectionId={resolvedActiveSectionId}
          activeQuestionId={activeQuestionId}
          onSelectQuestion={selectQuestion}
          t={translate}
        />
      </div>

      <PropertiesPane
        wsId={wsId}
        form={form}
        sectionIndex={Math.max(activeSectionIndex, 0)}
        questionIndex={Math.max(activeQuestionIndex, 0)}
        // Guarding on the index rather than the id: a stale id that no longer
        // resolves would render the editor bound to question 0 and silently
        // edit the wrong block.
        questionId={activeQuestionIndex >= 0 ? activeQuestionId : null}
        toneClasses={studioToneClasses}
        t={translate}
      />
    </div>
  );
}
