'use client';
import { Loader2, Play } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Kbd, KbdGroup } from '@tuturuuu/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { isApplePlatform, runShortcutKeys } from './run-shortcut';

const subscribe = () => () => {};

/** Run (or Run tests) with its Cmd/Ctrl+Enter shortcut in the tooltip and, on wide toolbars, the button. */
export function WorkbenchRunButton({
  label,
  disabled,
  busy,
  onRun,
  describedBy,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onRun: () => void;
  /** The element explaining why Run is disabled, e.g. the runner-unavailable card. */
  describedBy?: string;
}) {
  const t = useTranslations('programmingPlayground');
  // The platform is only known in the browser; the server renders Ctrl.
  const apple = useSyncExternalStore(subscribe, isApplePlatform, () => false);
  const keys = runShortcutKeys(apple);
  const shortcut = keys.join(' ');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-full px-3.5"
          disabled={disabled}
          aria-describedby={describedBy}
          aria-keyshortcuts={apple ? 'Meta+Enter' : 'Control+Enter'}
          onClick={onRun}
        >
          {busy ? (
            <Loader2
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Play aria-hidden="true" className="size-3.5" />
          )}
          {label}
          <KbdGroup aria-hidden="true" className="@3xl:inline-flex hidden">
            {keys.map((key) => (
              <Kbd
                key={key}
                className="h-4.5 bg-primary-foreground/15 px-1 text-[10px] text-primary-foreground"
              >
                {key}
              </Kbd>
            ))}
          </KbdGroup>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {t('runShortcut', { action: label, shortcut })}
      </TooltipContent>
    </Tooltip>
  );
}
