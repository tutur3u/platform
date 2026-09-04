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
import { ChevronDown, ChevronUp, GripVertical } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { FormsMarkdown } from '../forms-markdown';
import type { FormAnswerValue, FormDefinitionQuestion } from '../types';
import type { FormsTranslator, FormToneClasses } from './types';

/**
 * Resolves the order to display: the respondent's own ordering when they have
 * one, otherwise the author's.
 *
 * Values the form no longer offers are dropped and newly added options are
 * appended, so an answer saved before the author edited the options still
 * renders instead of collapsing to an empty list.
 */
export function resolveRankingOrder(
  question: FormDefinitionQuestion,
  value: FormAnswerValue | undefined
): string[] {
  const optionValues = question.options.map((option) => option.value);
  if (!Array.isArray(value)) return optionValues;

  const known = new Set(optionValues);
  const ranked = value.filter((entry) => known.has(entry));
  const rankedSet = new Set(ranked);

  return [...ranked, ...optionValues.filter((entry) => !rankedSet.has(entry))];
}

export function moveRankingEntry(
  order: string[],
  from: number,
  to: number
): string[] {
  if (from < 0 || from >= order.length) return order;
  if (to < 0 || to >= order.length || from === to) return order;

  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return order;
  next.splice(to, 0, moved);

  return next;
}

export function renderRankingField(args: {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  disabled: boolean;
  validationError?: string;
  toneClasses: FormToneClasses;
  t: FormsTranslator;
}) {
  if (args.question.type !== 'ranking') return null;

  return <RankingField {...args} />;
}

function RankingField({
  question,
  value,
  onChange,
  disabled,
  validationError,
  toneClasses,
  t,
}: {
  question: FormDefinitionQuestion;
  value: FormAnswerValue | undefined;
  onChange: (value: FormAnswerValue) => void;
  disabled: boolean;
  validationError?: string;
  toneClasses: FormToneClasses;
  t: FormsTranslator;
}) {
  const order = resolveRankingOrder(question, value);
  const optionByValue = new Map(
    question.options.map((option) => [option.value, option])
  );

  const sensors = useSensors(
    // The same 8px activation distance the studio uses, so a tap on the
    // move buttons is not swallowed as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // The answer is only written once the respondent moves something. Seeding it
  // with the author's order would mark an untouched ranking as answered, so a
  // required question would pass with nobody having ranked anything — and every
  // indifferent response would silently agree with the author.
  const commit = (next: string[]) => {
    if (disabled || next === order) return;
    onChange(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    commit(
      moveRankingEntry(
        order,
        order.indexOf(String(active.id)),
        order.indexOf(String(over.id))
      )
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul
          className={cn(
            'space-y-2',
            validationError ? 'rounded-2xl ring-2 ring-dynamic-red/15' : ''
          )}
        >
          {order.map((optionValue, index) => {
            const option = optionByValue.get(optionValue);
            if (!option) return null;

            return (
              <RankingRow
                key={optionValue}
                id={optionValue}
                label={option.label}
                index={index}
                total={order.length}
                disabled={disabled}
                validationError={validationError}
                toneClasses={toneClasses}
                t={t}
                onMove={(to) => commit(moveRankingEntry(order, index, to))}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function RankingRow({
  id,
  label,
  index,
  total,
  disabled,
  validationError,
  toneClasses,
  t,
  onMove,
}: {
  id: string;
  label: string;
  index: number;
  total: number;
  disabled: boolean;
  validationError?: string;
  toneClasses: FormToneClasses;
  t: FormsTranslator;
  onMove: (to: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3',
        toneClasses.optionCardClassName,
        validationError ? 'border-dynamic-red/30!' : '',
        isDragging ? 'z-10 opacity-80 shadow-md' : '',
        disabled ? 'opacity-75' : ''
      )}
    >
      <button
        type="button"
        // The drag handle is the only draggable surface: making the whole row
        // draggable would swallow taps meant for the move buttons.
        className={cn(
          'shrink-0 touch-none rounded-md p-1 text-muted-foreground',
          disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        )}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
        <span className="sr-only">{t('runtime.ranking_drag_handle')}</span>
      </button>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 font-semibold text-xs tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <FormsMarkdown content={label} className="[&_p]:m-0" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full"
          disabled={disabled || index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ChevronUp className="h-4 w-4" />
          <span className="sr-only">{t('runtime.ranking_move_up')}</span>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(index + 1)}
        >
          <ChevronDown className="h-4 w-4" />
          <span className="sr-only">{t('runtime.ranking_move_down')}</span>
        </Button>
      </div>
    </li>
  );
}
