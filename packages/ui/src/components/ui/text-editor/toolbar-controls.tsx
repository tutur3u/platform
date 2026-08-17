import { Toggle } from '@tuturuuu/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import type { ReactNode } from 'react';
import { hotkeyLabel, TOOLBAR_LABELS } from './toolbar-config';

interface ToolbarButtonProps {
  id: string;
  label?: string;
  icon: ReactNode;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** A toolbar toggle with an accessible label and optional hotkey hint. */
export function ToolbarButton({
  id,
  label: labelOverride,
  icon,
  pressed,
  onClick,
  disabled,
}: ToolbarButtonProps) {
  const label = labelOverride ?? TOOLBAR_LABELS[id] ?? id;
  const shortcut = hotkeyLabel(id);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          pressed={pressed}
          onPressedChange={() => onClick()}
          onMouseDown={(event) => event.preventDefault()}
          disabled={disabled}
          className="h-8 w-8 rounded-md border border-transparent transition-colors data-[state=on]:border-foreground/10 data-[state=on]:bg-dynamic-surface/80 data-[state=on]:text-foreground"
          aria-label={label}
        >
          {icon}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-1.5">
        <span>{label}</span>
        {shortcut ? (
          <kbd className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Vertical divider between toolbar groups. */
export function ToolbarSeparator() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-dynamic-border/60" />;
}
