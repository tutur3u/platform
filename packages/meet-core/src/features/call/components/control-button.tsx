'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useId,
} from 'react';

const CloseCallOverflow = createContext<(() => void) | null>(null);

/** One shape for every round call control: top bar, bottom bar and tools hub. */
export const controlButtonClass =
  'relative size-11 shrink-0 rounded-full border border-border bg-background text-foreground hover:bg-accent data-[state=open]:bg-accent';
/** A round control that carries a label from wide screens up. */
export const controlPillClass =
  'relative h-11 shrink-0 gap-2 rounded-full border border-border bg-background px-4 text-foreground hover:bg-accent data-[state=open]:bg-accent';
/**
 * One row grid for every menu row: a 20px icon slot, the label, then a
 * trailing slot. Rows are 40px tall, 44px on touch screens.
 */
export const controlRowClass =
  'relative h-auto min-h-10 w-full justify-start gap-3 whitespace-normal rounded-lg px-3 py-2 text-left font-normal pointer-coarse:min-h-11';

/** Renders ControlButtons as labelled menu rows that close the menu on use. */
export function ControlMenuScope({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <CloseCallOverflow.Provider value={onClose}>
      {children}
    </CloseCallOverflow.Provider>
  );
}

/** A quiet heading above a group of menu rows. */
export function ControlMenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs">
      {children}
    </p>
  );
}

export function ControlButton({
  active,
  danger,
  attention,
  icon: Icon,
  label,
  detail,
  hint,
  onClick,
  badge,
  busy,
  locked,
}: {
  active?: boolean;
  busy?: boolean;
  locked?: boolean;
  badge?: number;
  danger?: boolean;
  attention?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Trailing value shown on menu rows, such as the current layout. */
  detail?: string;
  /** Tooltip for a menu row; round controls show their label instead. */
  hint?: string;
  onClick: () => void;
}) {
  const closeOverflow = useContext(CloseCallOverflow);
  const button = (
    <Button
      aria-label={label}
      aria-busy={busy}
      disabled={busy || locked}
      aria-pressed={active}
      className={cn(
        closeOverflow ? controlRowClass : controlButtonClass,
        danger &&
          !closeOverflow &&
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Google Meet's convention: a lit control means the device is OFF.
        !danger &&
          active &&
          'border-transparent bg-foreground/15 hover:bg-foreground/20',
        attention &&
          'border-transparent bg-dynamic-orange/20 text-dynamic-orange ring-2 ring-dynamic-orange/60 hover:bg-dynamic-orange/30'
      )}
      onClick={() => {
        onClick();
        closeOverflow?.();
      }}
      size={closeOverflow ? 'default' : 'icon'}
      type="button"
      variant={danger ? 'destructive' : 'ghost'}
    >
      {busy ? (
        <Loader2 className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : (
        <Icon className="size-5 shrink-0" />
      )}
      {closeOverflow ? <span className="min-w-0 flex-1">{label}</span> : null}
      {closeOverflow && detail ? (
        <span className="shrink-0 text-muted-foreground text-xs">{detail}</span>
      ) : null}
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-dynamic-blue px-1 font-medium text-[0.6rem] text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </Button>
  );
  const tip = closeOverflow ? hint : label;
  if (!tip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {locked ? (
          // A disabled button fires no pointer events, so the wrapper keeps
          // the reason reachable by hover and keyboard.
          <span
            tabIndex={0}
            aria-label={hint ?? label}
            className={closeOverflow ? 'block' : undefined}
          >
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side={closeOverflow ? 'left' : undefined}>
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A menu row with switch semantics, such as showing the transcript panel.
 * `closeOnChange` closes the menu after the change, for rows that open a panel.
 */
export function ControlSwitchRow({
  icon: Icon,
  label,
  checked,
  onCheckedChange,
  closeOnChange = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  closeOnChange?: boolean;
}) {
  const closeOverflow = useContext(CloseCallOverflow);
  const switchId = useId();
  return (
    <Label
      htmlFor={switchId}
      className={cn(
        controlRowClass,
        'flex cursor-pointer items-center text-sm leading-snug hover:bg-accent'
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">{label}</span>
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={(next) => {
          onCheckedChange(next);
          if (closeOnChange) closeOverflow?.();
        }}
      />
    </Label>
  );
}
