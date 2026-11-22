'use client';
import { CodeXml, Lock } from '@tuturuuu/icons';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import { useTranslations } from 'next-intl';
import { LANGUAGE_LABELS } from './workbench-language';

/** The editor footer: the room's runtime by its full name, and whether this person can type. */
export function WorkbenchEditorStatus({
  language,
  editable,
}: {
  language: PlaygroundLanguage;
  editable: boolean;
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
      {!editable && (
        <span className="ml-auto flex items-center gap-1">
          <Lock aria-hidden="true" className="size-3" />
          {t('readOnly')}
        </span>
      )}
    </div>
  );
}
