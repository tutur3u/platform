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
  unavailable,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onRun: () => void;
  /**
   * Id of the card explaining that runs are unavailable. Run then stays
   * focusable with aria-disabled, so its tooltip can still say why.
   */
  unavailable?: string;
}) {
  const t = useTranslations('programmingPlayground');
  // The platform is only known in the browser; the server renders Ctrl.
  const apple = useSyncExternalStore(subscribe, isApplePlatform, () => false);
  const keys = runShortcutKeys(apple);
  const shortcut = keys.join(' ');
  const blocked = disabled || !!unavailable;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          disabled={disabled}
          aria-disabled={unavailable ? true : undefined}
          aria-describedby={unavailable}
          aria-keyshortcuts={
            blocked ? undefined : apple ? 'Meta+Enter' : 'Control+Enter'
          }
          className="h-8 gap-1.5 rounded-full px-3.5 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          onClick={() => {
            if (!blocked) onRun();
          }}
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
          {!unavailable && (
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
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {unavailable
          ? t('runnerUnavailableTitle')
          : t('runShortcut', { action: label, shortcut })}
      </TooltipContent>
    </Tooltip>
  );
}
