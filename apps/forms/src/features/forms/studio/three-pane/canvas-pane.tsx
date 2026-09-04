'use client';

import { cn } from '@tuturuuu/utils/format';
import { QuestionBlock } from '../../runtime/question-block';
import { getFormToneClasses } from '../../theme';
import type { FormDefinition } from '../../types';

/**
 * The centre pane: the form as respondents will see it, not as a list of
 * editors.
 *
 * It renders the real `QuestionBlock` from the runtime rather than a studio
 * mock, so the canvas cannot drift from the shipped product the way a
 * parallel preview implementation would. Every block is disabled — this is a
 * canvas for selecting, not for answering.
 */
export function CanvasPane({
  definition,
  activeSectionId,
  activeQuestionId,
  onSelectQuestion,
  t,
}: {
  definition: FormDefinition;
  activeSectionId: string;
  activeQuestionId: string;
  onSelectQuestion: (sectionId: string, questionId: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const toneClasses = getFormToneClasses(definition.theme.accentColor);

  return (
    <div className="min-w-0 space-y-8">
      {definition.sections.map((section, sectionIndex) => (
        <section
          key={section.id}
          id={`form-section-${section.id}`}
          className="min-w-0 space-y-2"
        >
          <p className="px-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.25em]">
            {section.title ||
              t('studio.section_n', { index: sectionIndex + 1 })}
          </p>

          <div className="min-w-0 space-y-1">
            {section.questions.map((question) => {
              const isSelected =
                section.id === activeSectionId &&
                question.id === activeQuestionId;

              return (
                <div
                  key={question.id}
                  className={cn(
                    'relative min-w-0 rounded-[1.75rem] border-2 transition-colors',
                    isSelected
                      ? 'border-dynamic-blue/60 bg-dynamic-blue/5'
                      : 'border-transparent hover:border-border/60'
                  )}
                >
                  <QuestionBlock
                    question={question}
                    value={undefined}
                    onChange={() => {
                      // The canvas is for selecting, never answering.
                    }}
                    onImagePreview={() => {
                      // Fullscreen preview belongs to the runtime, not here.
                    }}
                    disabled
                    toneClasses={toneClasses}
                    typography={definition.theme.typography}
                  />

                  {/* A transparent sibling rather than a wrapper: wrapping the
                      block in a button would nest its inputs and image control
                      inside a button, which is invalid markup. Every block here
                      is disabled, so nothing underneath needs the clicks. */}
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={t('studio.select_block')}
                    onClick={() => onSelectQuestion(section.id, question.id)}
                    className="absolute inset-0 cursor-pointer rounded-[1.6rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
