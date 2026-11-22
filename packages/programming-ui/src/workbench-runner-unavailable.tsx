'use client';
import { Check, CloudOff, Copy, Download, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface WorkbenchRunner {
  /** Referenced by the Run button's aria-describedby. */
  id: string;
  file?: { path: string; content: string };
  /** Absent for people who cannot start runs. */
  onRetry?: () => void;
  /** A run, save or earlier run is still in flight, or the room is read-only. */
  retryDisabled: boolean;
  /** The last save of the room failed, so the card does not claim the code is saved. */
  saveFailed: boolean;
}

const COPIED_MS = 2000;
// Some browsers start the download after click() returns; revoking at once can cancel it.
const REVOKE_MS = 1000;

function download(file: { path: string; content: string }) {
  const url = URL.createObjectURL(
    new Blob([file.content], { type: 'text/plain;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = file.path.split('/').at(-1) || file.path;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
}

/**
 * Shown once Meet's code runner answered that it cannot take runs. Run stays
 * visible but disabled; the card offers what still works: copying or
 * downloading the code, and a manual retry.
 */
export function WorkbenchRunnerUnavailable({
  id,
  file,
  onRetry,
  retryDisabled,
  saveFailed,
}: WorkbenchRunner) {
  const t = useTranslations('programmingPlayground');
  // Tied to the exact file and text copied, so an edit or a tab switch drops the confirmation.
  const [copy, setCopy] = useState<{
    state: 'copied' | 'failed';
    source: string;
  } | null>(null);
  const source = file ? `${file.path}\n${file.content}` : '';
  const copyState = copy?.source === source ? copy.state : 'idle';
  const name = file ? file.path.split('/').at(-1) || file.path : '';
  const copyCode = (value: { path: string; content: string }) => {
    const done = (state: 'copied' | 'failed') => {
      setCopy({ state, source });
      if (state === 'copied')
        setTimeout(
          () => setCopy((last) => (last?.source === source ? null : last)),
          COPIED_MS
        );
    };
    const clipboard =
      typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) return done('failed');
    clipboard.writeText(value.content).then(
      () => done('copied'),
      () => done('failed')
    );
  };
  return (
    <div
      id={id}
      role="status"
      className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-dynamic-orange/25 bg-dynamic-orange/5 px-3 py-2.5 text-sm"
    >
      <CloudOff
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-dynamic-orange"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-0.5">
          <p className="font-semibold">{t('runnerUnavailableTitle')}</p>
          <p className="text-muted-foreground text-xs">
            {t(
              saveFailed ? 'runnerUnavailableUnsaved' : 'runnerUnavailableBody'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {file && (
            <>
              <Button
                size="xs"
                variant="outline"
                className="rounded-full px-3"
                onClick={() => copyCode(file)}
              >
                {copyState === 'copied' ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : (
                  <Copy aria-hidden="true" className="size-3.5" />
                )}
                {t(copyState === 'copied' ? 'codeCopied' : 'copyCode')}
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="max-w-full rounded-full px-3"
                onClick={() => download(file)}
              >
                <Download aria-hidden="true" className="size-3.5" />
                <span className="truncate">
                  {t('downloadFile', { file: name })}
                </span>
              </Button>
            </>
          )}
          {onRetry && (
            <Button
              size="xs"
              variant="ghost"
              className="rounded-full px-3"
              disabled={retryDisabled}
              onClick={onRetry}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              {t('retry')}
            </Button>
          )}
        </div>
        {copyState === 'failed' && (
          <p role="alert" className="text-destructive text-xs">
            {t('copyFailed')}
          </p>
        )}
      </div>
    </div>
  );
}
