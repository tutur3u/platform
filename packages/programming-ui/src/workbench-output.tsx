'use client';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  TerminalSquare,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { classNames as cn } from './class-names';
import type { WorkbenchFailure } from './workbench-errors';
import { WorkbenchFailureNotice } from './workbench-failure-notice';
import {
  type OutputView,
  previewPort,
  type SaveState,
} from './workbench-layout';
import { WorkbenchRunSummary } from './workbench-run-summary';

export interface WorkbenchPreview {
  port: string;
  onPort: (value: string) => void;
  url: (port: number) => string;
  onClose: () => void;
}

export interface WorkbenchRunInput {
  command: string;
  onCommand: (value: string) => void;
  stdin: string;
  onStdin: (value: string) => void;
  editable: boolean;
}

function CommandField({
  run,
  className,
}: {
  run: WorkbenchRunInput;
  className?: string;
}) {
  const t = useTranslations('programmingPlayground');
  return (
    <div className={cn('relative min-w-0', className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-muted-foreground text-xs"
      >
        $
      </span>
      <Input
        aria-label={t('command')}
        value={run.command}
        disabled={!run.editable}
        spellCheck={false}
        onChange={(event) => run.onCommand(event.target.value)}
        className="h-8 w-full rounded-full pl-7 font-mono text-xs"
      />
    </div>
  );
}

/**
 * The console: the full run command, optional stdin, the real output (or an
 * explicit empty state), the run summary and a failure that names its step.
 * Learn's standalone playground shows it as a collapsible bottom panel;
 * meetings embed it in the output tabs.
 */
export function WorkbenchOutput({
  open,
  onToggle,
  view,
  save,
  failure = null,
  onRetry,
  retrying = false,
  durationMs,
  run,
  preview,
  embedded = false,
}: {
  open: boolean;
  onToggle: () => void;
  view: OutputView;
  save: SaveState;
  failure?: WorkbenchFailure | null;
  onRetry?: () => void;
  retrying?: boolean;
  /** Wall time of a run this browser started, once it finished. */
  durationMs?: number | null;
  /** Absent for Learn problems and viewers; the command and stdin belong to the playground run. */
  run?: WorkbenchRunInput;
  preview?: WorkbenchPreview;
  embedded?: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  const stdinId = useId();
  const [stdinOpen, setStdinOpen] = useState(false);
  const port = preview ? previewPort(preview.port) : null;
  const status = view.running
    ? t('running')
    : save === 'failed'
      ? t('saveFailed')
      : save === 'saved'
        ? t('saved')
        : null;
  const statusLine = status && (
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
  );
  const previewControls = preview && (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        aria-label={t('previewPort')}
        value={preview.port}
        onChange={(event) => preview.onPort(event.target.value)}
        className="h-8 w-24 rounded-full font-mono text-xs"
        inputMode="numeric"
      />
      {port && (
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="size-8 rounded-full"
        >
          <a
            href={preview.url(port)}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t('previewOpenTab')}
            title={t('previewOpenTab')}
          >
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-full"
        aria-label={t('previewClose')}
        title={t('previewClose')}
        onClick={preview.onClose}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
  return (
    <section
      aria-label={t('console')}
      className={cn(
        embedded
          ? 'flex min-h-0 flex-1 flex-col'
          : cn(
              'flex shrink-0 flex-col border-t bg-muted/20',
              open ? 'h-[36%] min-h-44' : 'h-10'
            )
      )}
    >
      {!embedded && (
        <div className="flex h-10 shrink-0 items-center gap-2 px-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                !open && '-rotate-90'
              )}
              aria-hidden="true"
            />
            {t('console')}
          </button>
          {statusLine}
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {run && (
              <>
                <CommandField run={run} className="w-56 sm:w-80" />
                <Button
                  size="icon"
                  variant={stdinOpen ? 'secondary' : 'ghost'}
                  className="size-8 rounded-full"
                  aria-label={t('stdin')}
                  aria-pressed={stdinOpen}
                  title={t('stdin')}
                  onClick={() => setStdinOpen((value) => !value)}
                >
                  <TerminalSquare className="size-3.5" />
                </Button>
              </>
            )}
            {previewControls}
          </div>
        </div>
      )}
      {open && (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-2',
            embedded ? 'p-2.5' : 'px-2 pb-2'
          )}
        >
          {embedded && run && (
            <div className="flex flex-col gap-1">
              <CommandField run={run} />
              <button
                type="button"
                aria-expanded={stdinOpen}
                aria-controls={stdinId}
                onClick={() => setStdinOpen((value) => !value)}
                className="flex items-center gap-1 self-start rounded-full px-1.5 py-0.5 font-semibold text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'size-3.5 transition-transform motion-reduce:transition-none',
                    stdinOpen && 'rotate-90'
                  )}
                />
                {t('stdinToggle')}
              </button>
            </div>
          )}
          {embedded && previewControls && (
            <div className="flex justify-end">{previewControls}</div>
          )}
          {run && stdinOpen && (
            <Textarea
              id={stdinId}
              aria-label={t('stdin')}
              placeholder={t('stdinPlaceholder')}
              value={run.stdin}
              onChange={(event) => run.onStdin(event.target.value)}
              className="h-16 min-h-16 rounded-[var(--radius-lg)] font-mono text-xs"
            />
          )}
          {preview && port ? (
            <iframe
              title={t('preview')}
              sandbox="allow-scripts allow-forms"
              referrerPolicy="no-referrer"
              src={preview.url(port)}
              className={cn(
                'w-full flex-1 rounded-[var(--radius-lg)] border bg-background',
                embedded ? 'min-h-28' : 'min-h-0'
              )}
            />
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-lg)] border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed">
              {preview && !port
                ? t('webPreviewPortHint')
                : view.text || (
                    <span className="text-muted-foreground">
                      {t(view.running ? 'running' : 'outputEmpty')}
                    </span>
                  )}
            </pre>
          )}
          {failure && (
            <WorkbenchFailureNotice
              failure={failure}
              onRetry={onRetry}
              retrying={retrying}
            />
          )}
          {(view.exitCode !== null || (embedded && statusLine)) && (
            <div className="flex min-h-6 items-center justify-between gap-2">
              {view.exitCode !== null ? (
                <WorkbenchRunSummary
                  exitCode={view.exitCode}
                  durationMs={durationMs}
                />
              ) : (
                <span />
              )}
              {embedded && statusLine}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
