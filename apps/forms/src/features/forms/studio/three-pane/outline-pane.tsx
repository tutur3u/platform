'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { FormCollaboratorPresence } from '../../collaboration';
import { normalizeMarkdownToText } from '../../content';
import { QuestionTypeIcon } from '../../form-icons';
import type { FormQuestionInput, FormStudioInput } from '../../schema';

/**
 * The left pane: every section and block in order, as the map of the form.
 *
 * This is the only place ordering and selection live in the three-pane layout.
 * The canvas selects through it and the properties pane edits whatever it
 * points at, so a block is never selected in two places at once.
 */
export function OutlinePane({
  sections,
  activeSectionId,
  activeQuestionId,
  onSelectSection,
  onSelectQuestion,
  onReorderQuestions,
  onAddSection,
  getBlockEditors,
  t,
}: {
  sections: FormStudioInput['sections'];
  activeSectionId: string;
  activeQuestionId: string;
  onSelectSection: (sectionId: string) => void;
  onSelectQuestion: (sectionId: string, questionId: string) => void;
  /** Commits a new question order for one section. */
  onReorderQuestions: (sectionIndex: number, order: string[]) => void;
  onAddSection: () => void;
  getBlockEditors: (blockId: string) => FormCollaboratorPresence[];
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <nav
      aria-labelledby="form-studio-outline-heading"
      className="flex max-h-[calc(100vh-9rem)] min-w-0 flex-col gap-3 overflow-y-auto rounded-[1.5rem] border border-border/60 bg-card/60 p-3"
    >
      <h2
        id="form-studio-outline-heading"
        className="px-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.25em]"
      >
        {t('studio.outline')}
      </h2>

      <ol className="min-w-0 space-y-3">
        {sections.map((section, sectionIndex) => {
          const sectionId = section.id ?? '';
          const isActiveSection = sectionId === activeSectionId;

          return (
            <li key={sectionId || sectionIndex} className="min-w-0 space-y-1">
              <button
                type="button"
                onClick={() => onSelectSection(sectionId)}
                className={cn(
                  'w-full truncate rounded-xl px-2 py-1.5 text-left font-semibold text-xs transition-colors',
                  isActiveSection
                    ? 'bg-foreground/10 text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/5'
                )}
              >
                {normalizeMarkdownToText(section.title) ||
                  t('studio.section_n', { index: sectionIndex + 1 })}
              </button>

              <OutlineBlockList
                section={section}
                sectionIndex={sectionIndex}
                sectionId={sectionId}
                isActiveSection={isActiveSection}
                activeQuestionId={activeQuestionId}
                onSelectQuestion={onSelectQuestion}
                onReorderQuestions={onReorderQuestions}
                getBlockEditors={getBlockEditors}
                t={t}
              />
            </li>
          );
        })}
      </ol>

      {/* Adding a block stays on the block rail, which already owns the type
          picker. Duplicating it here would mean two pickers to keep in step. */}
      <div className="sticky bottom-0 flex flex-col gap-1.5 bg-card/60 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start rounded-xl text-xs"
          onClick={onAddSection}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('studio.add_section')}
        </Button>
      </div>
    </nav>
  );
}

/**
 * One section's blocks, reorderable within that section.
 *
 * A DndContext per section rather than one for the outline means a drag simply
 * cannot cross a section boundary — moving a block between sections would have
 * to rewrite two arrays and re-key branching rules that reference it, so it is
 * left to the stacked layout until that is designed properly.
 */
function OutlineBlockList({
  section,
  sectionIndex,
  sectionId,
  isActiveSection,
  activeQuestionId,
  onSelectQuestion,
  onReorderQuestions,
  getBlockEditors,
  t,
}: {
  section: FormStudioInput['sections'][number];
  sectionIndex: number;
  sectionId: string;
  isActiveSection: boolean;
  activeQuestionId: string;
  onSelectQuestion: (sectionId: string, questionId: string) => void;
  onReorderQuestions: (sectionIndex: number, order: string[]) => void;
  getBlockEditors: (blockId: string) => FormCollaboratorPresence[];
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const sensors = useSensors(
    // The same 8px threshold the rest of the studio uses, so a click to select
    // is not swallowed as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const order = section.questions.map((question) => question.id ?? '');

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);

    onReorderQuestions(sectionIndex, next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol className="min-w-0 space-y-0.5 border-border/60 border-l pl-2">
          {section.questions.map((question, questionIndex) => (
            <OutlineBlockRow
              key={question.id ?? questionIndex}
              question={question}
              index={questionIndex}
              isSelected={isActiveSection && question.id === activeQuestionId}
              editors={getBlockEditors(question.id ?? '')}
              onSelect={() => onSelectQuestion(sectionId, question.id ?? '')}
              t={t}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function OutlineBlockRow({
  question,
  index,
  isSelected,
  editors,
  onSelect,
  t,
}: {
  question: FormQuestionInput;
  index: number;
  isSelected: boolean;
  editors: FormCollaboratorPresence[];
  onSelect: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const label =
    normalizeMarkdownToText(question.title) ||
    t(`question_type.${question.type}` as never);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id ?? '' });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('min-w-0', isDragging && 'z-10 opacity-70')}
    >
      <button
        type="button"
        onClick={onSelect}
        {...attributes}
        {...listeners}
        aria-current={isSelected ? 'true' : undefined}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
          isSelected
            ? 'bg-foreground/10 font-medium text-foreground'
            : 'text-muted-foreground hover:bg-foreground/5'
        )}
      >
        <span className="w-4 shrink-0 text-right tabular-nums opacity-60">
          {index + 1}
        </span>
        <QuestionTypeIcon
          type={question.type}
          className="h-3.5 w-3.5 shrink-0 opacity-70"
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {question.required ? (
          <span aria-hidden className="shrink-0 font-semibold text-dynamic-red">
            *
          </span>
        ) : null}
        {editors.length > 0 ? (
          // A dot per collaborator rather than a count: at this size the
          // number would be unreadable, and the point is only "someone else
          // is in here".
          <span className="flex shrink-0 items-center -space-x-1">
            {editors.slice(0, 3).map((editor) => (
              <span
                key={editor.sessionId}
                title={editor.user.displayName}
                className="h-2 w-2 rounded-full bg-dynamic-green ring-1 ring-background"
              />
            ))}
          </span>
        ) : null}
      </button>
    </li>
  );
}
