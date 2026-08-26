'use client';

import { cn } from '@tuturuuu/utils/format';
import type { getFormToneClasses } from '../../theme';
import { QuestionEditor } from '../question-editor';
import { SectionFields } from '../section-fields';
import type { StudioForm } from '../studio-utils';

function noop() {
  // Intentionally empty; see the call site.
}

/**
 * The right pane: the settings of whatever the outline has selected.
 *
 * It renders `QuestionEditor` in its `panel` variant rather than a second
 * editor implementation, so a field added to the accordion appears here with
 * no extra work — the alternative was two editors that drift.
 */
export function PropertiesPane({
  wsId,
  form,
  sectionIndex,
  questionIndex,
  questionId,
  sectionId,
  toneClasses,
  t,
}: {
  wsId: string;
  form: StudioForm;
  sectionIndex: number;
  questionIndex: number;
  questionId: string | null;
  /** Empty when no section resolves; the pane then has nothing to edit. */
  sectionId: string;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <aside
      aria-labelledby="form-studio-properties-heading"
      className={cn(
        'flex max-h-[calc(100vh-9rem)] min-w-0 flex-col overflow-y-auto',
        'rounded-[1.5rem] border border-border/60 bg-card/60'
      )}
    >
      <h2
        id="form-studio-properties-heading"
        className="px-5 pt-4 pb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.25em]"
      >
        {questionId ? t('studio.properties') : t('studio.section_details')}
      </h2>

      {questionId ? (
        <QuestionEditor
          // Remounting on selection drops the previous block's local editor
          // state (open menus, pending dialogs) instead of carrying it over to
          // an unrelated block.
          key={questionId}
          variant="panel"
          wsId={wsId}
          questionId={questionId}
          sectionIndex={sectionIndex}
          questionIndex={questionIndex}
          form={form}
          open
          onOpenChange={() => {
            // Always open in the panel; the outline controls what is shown.
          }}
          // Reorder, duplicate and delete live in the editor's header, which
          // the panel variant does not render — the outline owns those. They
          // are required props, so they are satisfied and never called.
          onMoveUp={noop}
          onMoveDown={noop}
          onDuplicate={noop}
          onRemove={noop}
          toneClasses={toneClasses}
        />
      ) : sectionId ? (
        // A selected section is still something to edit. Showing "select a
        // block" here was the gap that made sections read-only in this layout.
        <div className="px-5 pb-5">
          <SectionFields
            key={sectionId}
            wsId={wsId}
            form={form}
            sectionIndex={sectionIndex}
            toneClasses={toneClasses}
          />
        </div>
      ) : (
        <p className="px-5 pb-5 text-muted-foreground text-sm">
          {t('studio.select_a_block')}
        </p>
      )}
    </aside>
  );
}
