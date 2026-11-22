import { Check, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { type RefObject, useRef, useState } from 'react';

/**
 * Copies text from a click. When the clipboard refuses, it selects the
 * source element's text so the reader can copy it themselves.
 */
export function CopyButton({
  text,
  label,
  done,
  failed,
  source,
  icon = Copy,
}: {
  text: () => string;
  label: string;
  done: string;
  failed: string;
  source?: RefObject<HTMLElement | null>;
  icon?: typeof Copy;
}) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const Icon = state === 'done' ? Check : icon;
  const settle = (next: 'done' | 'failed') => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-full"
      onClick={() => {
        const select = () => {
          const element = source?.current;
          const selection = window.getSelection();
          if (element && selection) {
            selection.selectAllChildren(element);
          }
          settle('failed');
        };
        if (!navigator.clipboard?.writeText) return select();
        navigator.clipboard
          .writeText(text())
          .then(() => settle('done'), select);
      }}
    >
      <Icon size={14} aria-hidden />
      <span aria-live="polite">
        {state === 'done' ? done : state === 'failed' ? failed : label}
      </span>
    </Button>
  );
}
