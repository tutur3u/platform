'use client';

import { ExternalLink } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';

export function MiraWorkspaceSettingsLink({ wsId }: { wsId: string }) {
  const locale = useLocale();
  const t = useTranslations('meet.call');
  return (
    <Button asChild variant="link" size="sm" className="px-0">
      <a
        href={`https://workspace.tuturuuu.com/${encodeURIComponent(locale)}/${encodeURIComponent(wsId)}/settings`}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink className="size-4" />
        {t('personal_workspace_settings')}
      </a>
    </Button>
  );
}
