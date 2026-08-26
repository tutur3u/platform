'use client';

import { ChevronDown, ChevronUp, Copy, Trash } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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
  actions,
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
  /**
   * Reorder, duplicate and delete for the selected block. They live here
   * rather than on each outline row: the outline is 240px wide and a control
   * per row would crowd out the labels, and this pane is already "the selected
   * block".
   */
  actions: {
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
  };
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
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2
          id="form-studio-properties-heading"
          className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.25em]"
        >
          {questionId
            ? t('studio.properties')
            : sectionId
              ? t('studio.section_details')
              : t('studio.properties')}
        </h2>

        {questionId ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              disabled={!actions.canMoveUp}
              onClick={actions.onMoveUp}
            >
              <ChevronUp className="h-3.5 w-3.5" />
              <span className="sr-only">{t('studio.move_block_up')}</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              disabled={!actions.canMoveDown}
              onClick={actions.onMoveDown}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              <span className="sr-only">{t('studio.move_block_down')}</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              onClick={actions.onDuplicate}
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="sr-only">{t('studio.duplicate_block')}</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-dynamic-red hover:text-dynamic-red"
              onClick={actions.onRemove}
            >
              <Trash className="h-3.5 w-3.5" />
              <span className="sr-only">{t('studio.delete_block')}</span>
            </Button>
          </div>
        ) : null}
      </div>

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
          // The panel variant does not render the editor's own header, so
          // these are never called from inside it — this pane's header owns
          // them instead.
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
