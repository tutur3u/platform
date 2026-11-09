import { cn } from '@tuturuuu/utils/format';
import { type ComponentProps, forwardRef } from 'react';

/**
 * Neutral is the board toolbar: outline controls, tinted when not on their
 * default, as the board header always drew them. Colors mark sprint actions
 * and summary figures. A colored button fills when it is not on its default.
 */
export type ToolbarTone =
  | 'neutral'
  | 'blue'
  | 'purple'
  | 'cyan'
  | 'orange'
  | 'green';

const TONE_CLASSES: Record<ToolbarTone, { idle: string; active: string }> = {
  neutral: {
    idle: 'border-input bg-background text-foreground hover:bg-accent',
    active:
      'border-primary/50 bg-primary/5 text-foreground hover:bg-primary/10',
  },
  blue: {
    idle: 'border-dynamic-blue/30 bg-dynamic-blue/5 text-dynamic-blue hover:bg-dynamic-blue/15',
    active:
      'border-transparent bg-dynamic-blue/85 text-background hover:bg-dynamic-blue',
  },
  purple: {
    idle: 'border-dynamic-purple/30 bg-dynamic-purple/5 text-dynamic-purple hover:bg-dynamic-purple/15',
    active:
      'border-transparent bg-dynamic-purple/85 text-background hover:bg-dynamic-purple',
  },
  cyan: {
    idle: 'border-dynamic-cyan/30 bg-dynamic-cyan/5 text-dynamic-cyan hover:bg-dynamic-cyan/15',
    active:
      'border-transparent bg-dynamic-cyan/85 text-background hover:bg-dynamic-cyan',
  },
  orange: {
    idle: 'border-dynamic-orange/30 bg-dynamic-orange/5 text-dynamic-orange hover:bg-dynamic-orange/15',
    active:
      'border-transparent bg-dynamic-orange/85 text-background hover:bg-dynamic-orange',
  },
  green: {
    idle: 'border-dynamic-green/30 bg-dynamic-green/5 text-dynamic-green hover:bg-dynamic-green/15',
    active:
      'border-transparent bg-dynamic-green/85 text-background hover:bg-dynamic-green',
  },
};

export const TOOLBAR_CONTROL_CLASS =
  'inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 font-medium text-xs transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0';

export function toneClasses(tone: ToolbarTone, active = false) {
  return TONE_CLASSES[tone][active ? 'active' : 'idle'];
}

type ToneButtonProps = ComponentProps<'button'> & {
  active?: boolean;
  tone: ToolbarTone;
};

export const ToneButton = forwardRef<HTMLButtonElement, ToneButtonProps>(
  function ToneButton(
    { active = false, className, tone, type = 'button', ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          TOOLBAR_CONTROL_CLASS,
          toneClasses(tone, active),
          className
        )}
        {...props}
      />
    );
  }
);
