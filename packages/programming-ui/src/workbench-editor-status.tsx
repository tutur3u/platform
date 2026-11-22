'use client';
import {
  CircleAlert,
  CircleCheck,
  CodeXml,
  Loader2,
  Lock,
  Pause,
} from '@tuturuuu/icons';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { DiagnosticsStatus } from './code-diagnostics';
import { LANGUAGE_LABELS } from './workbench-language';

function ProblemsStatus({ status }: { status: DiagnosticsStatus }) {
  const t = useTranslations('programmingPlayground');
  switch (status.kind) {
    case 'off':
      return null;
    case 'checking':
      return (
        <span className="flex items-center gap-1">
          <Loader2
            aria-hidden="true"
            className="size-3 animate-spin motion-reduce:animate-none"
          />
          {t('diagnosticsChecking')}
        </span>
      );
    case 'paused':
      return (
        <span className="flex items-center gap-1">
          <Pause aria-hidden="true" className="size-3" />
          {t('diagnosticsPaused')}
        </span>
      );
    case 'tooLarge':
      return (
        <span className="flex items-center gap-1">
          <Pause aria-hidden="true" className="size-3" />
          {t('diagnosticsTooLarge')}
        </span>
      );
    case 'ready': {
      const Icon = status.problems ? CircleAlert : CircleCheck;
      return (
        <span className="flex items-center gap-1">
          <Icon aria-hidden="true" className="size-3" />
          {t('diagnosticsProblems', { count: status.problems })}
        </span>
      );
    }
  }
}

/**
 * What a screen reader hears: the settled state, once per change. Checking is
 * visual only and keeps the last announcement, so an unchanged count is not
 * read out again after every check. It is announced once the state has held
 * for a second, so a stream of worker updates does not chatter.
 */
const ANNOUNCE_SETTLE_MS = 1000;
function ProblemsAnnouncement({ status }: { status: DiagnosticsStatus }) {
  const t = useTranslations('programmingPlayground');
  const text =
    status.kind === 'checking'
      ? undefined
      : status.kind === 'off'
        ? ''
        : status.kind === 'paused'
          ? t('diagnosticsPaused')
          : status.kind === 'tooLarge'
            ? t('diagnosticsTooLarge')
            : t('diagnosticsProblems', { count: status.problems });
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    if (text === undefined) return;
    const timer = setTimeout(() => setAnnounced(text), ANNOUNCE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <output aria-live="polite" className="sr-only">
      {announced}
    </output>
  );
}

/** The editor footer: the room's runtime by its full name, its problems, and whether this person can type. */
export function WorkbenchEditorStatus({
  language,
  editable,
  diagnostics = { kind: 'off' },
}: {
  language: PlaygroundLanguage;
  editable: boolean;
  diagnostics?: DiagnosticsStatus;
}) {
  const t = useTranslations('programmingPlayground');
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t bg-muted/25 px-3 text-muted-foreground text-xs">
      <span
        data-language={language}
        className="flex items-center gap-1.5 font-semibold text-foreground"
      >
        <CodeXml aria-hidden="true" className="size-3.5 text-primary" />
        <span className="sr-only">{t('language')}: </span>
        {LANGUAGE_LABELS[language]}
      </span>
      <span className="inline-flex items-center">
        <span aria-hidden="true">
          <ProblemsStatus status={diagnostics} />
        </span>
        <ProblemsAnnouncement status={diagnostics} />
      </span>
      {!editable && (
        <span className="ml-auto flex items-center gap-1">
          <Lock aria-hidden="true" className="size-3" />
          {t('readOnly')}
        </span>
      )}
    </div>
  );
}
