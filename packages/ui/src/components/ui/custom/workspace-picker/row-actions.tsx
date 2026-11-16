'use client';

import { Eye, EyeOff, MoreHorizontal, Pin, Star } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useState } from 'react';
import { Button } from '../../button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../dropdown-menu';
import { PICKER_ROW_LAYOUT, type PickerVariant } from './row-layout';

export interface PickerRowActionState {
  name: string;
  pinned: boolean;
  isDefault: boolean;
  hidden: boolean;
  pending: boolean;
  canPin: boolean;
  canDefault: boolean;
  tabbable: boolean;
  onTogglePin: () => void;
  onDefault: () => void;
  onToggleHidden: () => void;
  t: (key: string) => string;
}

/** Fills an unavailable action so the remaining actions keep their column. */
function EmptySlot() {
  return <span aria-hidden="true" className="size-7" data-picker-slot="" />;
}

function SlotButton({
  label,
  on = false,
  pressed,
  disabled,
  tabbable,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  tabbable: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'size-7 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
        on && 'text-foreground opacity-100'
      )}
      data-on={on || undefined}
      data-picker-action=""
      data-picker-slot=""
      disabled={disabled}
      onClick={onClick}
      size="icon"
      tabIndex={tabbable ? 0 : -1}
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function DesktopActions(state: PickerRowActionState) {
  const { name, t, tabbable } = state;
  return (
    <>
      {state.canPin ? (
        <SlotButton
          label={`${t('picker_pin')}: ${name}`}
          on={state.pinned}
          onClick={state.onTogglePin}
          pressed={state.pinned}
          tabbable={tabbable}
        >
          <Pin className={state.pinned ? 'fill-current' : undefined} />
        </SlotButton>
      ) : (
        <EmptySlot />
      )}
      {state.canDefault ? (
        <SlotButton
          disabled={state.isDefault}
          label={`${t(state.isDefault ? 'default_workspace' : 'picker_set_default')}: ${name}`}
          on={state.isDefault}
          onClick={state.onDefault}
          tabbable={tabbable}
        >
          <Star className={state.isDefault ? 'fill-current' : undefined} />
        </SlotButton>
      ) : (
        <EmptySlot />
      )}
      <SlotButton
        disabled={state.pending}
        label={`${t(state.hidden ? 'restore_workspace' : 'hide_workspace')}: ${name}`}
        onClick={state.onToggleHidden}
        tabbable={tabbable}
      >
        {state.hidden ? <Eye /> : <EyeOff />}
      </SlotButton>
    </>
  );
}

function CompactActions(state: PickerRowActionState) {
  const { name, t } = state;
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  const label = `${t('picker_more_actions')}: ${name}`;
  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="size-11 text-muted-foreground"
          data-picker-action=""
          data-picker-slot=""
          size="icon"
          tabIndex={state.tabbable ? 0 : -1}
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={label} align="end" className="min-w-56">
        {state.canPin ? (
          <DropdownMenuItem
            className="min-h-11"
            onSelect={() => run(state.onTogglePin)}
          >
            <Pin className={state.pinned ? 'fill-current' : undefined} />
            {t(state.pinned ? 'picker_unpin' : 'picker_pin')}
          </DropdownMenuItem>
        ) : null}
        {state.canDefault ? (
          <DropdownMenuItem
            className="min-h-11"
            disabled={state.isDefault}
            onSelect={() => run(state.onDefault)}
          >
            <Star className={state.isDefault ? 'fill-current' : undefined} />
            {t(state.isDefault ? 'default_workspace' : 'picker_set_default')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="min-h-11"
          disabled={state.pending}
          onSelect={() => run(state.onToggleHidden)}
        >
          {state.hidden ? <Eye /> : <EyeOff />}
          {t(state.hidden ? 'restore_workspace' : 'hide_workspace')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PickerRowActions({
  variant,
  ...state
}: PickerRowActionState & { variant: PickerVariant }) {
  const layout = PICKER_ROW_LAYOUT[variant];
  return (
    <span
      className="grid items-center justify-end"
      data-picker-cell="actions"
      style={{
        gridTemplateColumns: `repeat(${layout.actionSlots}, ${layout.actionSize}px)`,
        columnGap: layout.actionGap,
        paddingInlineEnd: layout.actionInset,
      }}
    >
      {variant === 'sheet' ? (
        <CompactActions {...state} />
      ) : (
        <DesktopActions {...state} />
      )}
    </span>
  );
}
