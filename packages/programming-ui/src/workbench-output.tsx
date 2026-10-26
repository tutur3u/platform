'use client';
import { ChevronDown, TerminalSquare, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { classNames as cn } from './class-names';
import {
  type OutputView,
  previewPort,
  type SaveState,
} from './workbench-layout';

export interface WorkbenchPreview {
  port: string;
  onPort: (value: string) => void;
  url: (port: number) => string;
  onClose: () => void;
}

/** Collapsible bottom panel: run bar, then real output, an explicit empty state, or the opted-in preview. */
export function WorkbenchOutput({
  open,
  onToggle,
  view,
  save,
  failed,
  run,
  preview,
}: {
  open: boolean;
  onToggle: () => void;
  view: OutputView;
  save: SaveState;
  failed: boolean;
  /** Absent for Learn problems and viewers; the command and stdin belong to the playground run. */
  run?: {
    command: string;
    onCommand: (value: string) => void;
    stdin: string;
    onStdin: (value: string) => void;
    editable: boolean;
  };
  preview?: WorkbenchPreview;
}) {
  const t = useTranslations('programmingPlayground');
  const [stdinOpen, setStdinOpen] = useState(false);
  const port = preview ? previewPort(preview.port) : null;
  const status = view.running
    ? t('running')
    : save === 'failed'
      ? t('saveFailed')
      : save === 'saved'
        ? t('saved')
        : null;
  return (
    <section
      aria-label={t('console')}
      className={cn(
        'flex shrink-0 flex-col border-t bg-muted/20',
        open ? 'h-[36%] min-h-44' : 'h-9'
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 px-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex items-center gap-1 rounded px-1 font-medium text-xs hover:bg-muted"
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              !open && '-rotate-90'
            )}
            aria-hidden="true"
          />
          {t('console')}
        </button>
        {status && (
          <output
            className={cn(
              'truncate text-xs',
              save === 'failed' && !view.running
                ? 'text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {status}
          </output>
        )}
        <div className="ml-auto flex items-center gap-1">
          {run && (
            <>
              <div className="flex items-center gap-1 font-mono text-xs">
                <span className="text-muted-foreground" aria-hidden="true">
                  $
                </span>
                <Input
                  aria-label={t('command')}
                  value={run.command}
                  disabled={!run.editable}
                  onChange={(event) => run.onCommand(event.target.value)}
                  className="h-7 w-48 font-mono text-xs sm:w-64"
                />
              </div>
              <Button
                size="icon"
                variant={stdinOpen ? 'secondary' : 'ghost'}
                className="size-7"
                aria-label={t('stdin')}
                aria-pressed={stdinOpen}
                title={t('stdin')}
                onClick={() => setStdinOpen((value) => !value)}
              >
                <TerminalSquare className="size-3.5" />
              </Button>
            </>
          )}
          {preview && (
            <>
              <Input
                aria-label={t('previewPort')}
                value={preview.port}
                onChange={(event) => preview.onPort(event.target.value)}
                className="h-7 w-20 font-mono text-xs"
                inputMode="numeric"
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t('previewClose')}
                title={t('previewClose')}
                onClick={preview.onClose}
              >
                <X className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col">
          {run && stdinOpen && (
            <Textarea
              aria-label={t('stdin')}
              placeholder={t('stdin')}
              value={run.stdin}
              onChange={(event) => run.onStdin(event.target.value)}
              className="mx-2 mb-2 h-16 min-h-16 font-mono text-xs"
            />
          )}
          {preview && port ? (
            <iframe
              title={t('preview')}
              sandbox="allow-scripts allow-forms"
              referrerPolicy="no-referrer"
              src={preview.url(port)}
              className="min-h-0 w-full flex-1 bg-background"
            />
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 font-mono text-xs">
              {view.text || (
                <span className="text-muted-foreground">
                  {t('outputEmpty')}
                </span>
              )}
            </pre>
          )}
          {view.exitCode !== null && (
            <p className="px-3 pb-2 text-muted-foreground text-xs">
              {t('exitCode', { code: view.exitCode })}
            </p>
          )}
          {failed && (
            <p role="alert" className="px-3 pb-2 text-destructive text-xs">
              {t('failed')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
