import { SquareCheck } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type MouseEvent,
} from 'react';
import { TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES } from './task-card-checkbox-style';

interface TaskCardSelectionCheckboxProps
  extends Omit<ComponentPropsWithoutRef<'label'>, 'onClick'> {
  checked: boolean;
  label: string;
  onSelectionClick?: (event: MouseEvent<HTMLInputElement>) => void;
}

export const TaskCardSelectionCheckbox = forwardRef<
  HTMLLabelElement,
  TaskCardSelectionCheckboxProps
>(function TaskCardSelectionCheckbox(
  { checked, className, label, onPointerDown, onSelectionClick, ...props },
  ref
) {
  return (
    <label
      ref={ref}
      className={cn(TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES, className)}
      data-state={checked ? 'checked' : 'unchecked'}
      data-testid="task-card-selection-checkbox"
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      {...props}
    >
      <input
        aria-label={label}
        checked={checked}
        className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
        readOnly
        type="checkbox"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelectionClick?.(event);
        }}
      />
      {checked && (
        <SquareCheck
          aria-hidden="true"
          className="pointer-events-none size-4 shrink-0 stroke-[2.4]"
          data-testid="task-card-selection-icon"
        />
      )}
    </label>
  );
});
