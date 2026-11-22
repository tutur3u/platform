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
      <output aria-live="polite" className="contents">
        <ProblemsStatus status={diagnostics} />
      </output>
      {!editable && (
        <span className="ml-auto flex items-center gap-1">
          <Lock aria-hidden="true" className="size-3" />
          {t('readOnly')}
        </span>
      )}
    </div>
  );
}
