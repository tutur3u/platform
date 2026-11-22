'use client';
import { Check, CloudOff, Copy, Download, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface WorkbenchRunner {
  /** Referenced by the Run button's aria-describedby. */
  id: string;
  file?: { path: string; content: string };
  onRetry: () => void;
  retrying: boolean;
}

function download(file: { path: string; content: string }) {
  const url = URL.createObjectURL(
    new Blob([file.content], { type: 'text/plain;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = file.path.split('/').at(-1) || file.path;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Shown once Meet's code runner answered that it cannot take runs. Run stays
 * visible but disabled; the code itself is safe in the room, so the card
 * offers what still works: copying or downloading it, and a manual retry.
 */
export function WorkbenchRunnerUnavailable({
  id,
  file,
  onRetry,
  retrying,
}: WorkbenchRunner) {
  const t = useTranslations('programmingPlayground');
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const name = file ? file.path.split('/').at(-1) || file.path : '';
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
            {t('runnerUnavailableBody')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {file && (
            <>
              <Button
                size="xs"
                variant="outline"
                className="rounded-full px-3"
                onClick={() =>
                  navigator.clipboard
                    .writeText(file.content)
                    .then(() => setCopy('copied'))
                    .catch(() => setCopy('failed'))
                }
              >
                {copy === 'copied' ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : (
                  <Copy aria-hidden="true" className="size-3.5" />
                )}
                {t(copy === 'copied' ? 'codeCopied' : 'copyCode')}
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
          <Button
            size="xs"
            variant="ghost"
            className="rounded-full px-3"
            disabled={retrying}
            onClick={onRetry}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {t('retry')}
          </Button>
        </div>
        {copy === 'failed' && (
          <p role="alert" className="text-destructive text-xs">
            {t('copyFailed')}
          </p>
        )}
      </div>
    </div>
  );
}
