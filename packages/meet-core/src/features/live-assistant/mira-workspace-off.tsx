'use client';

import { Settings2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useOpenCallSettings } from '../call/components/call-settings-link';
import { MIRA_SETTINGS_TAB, useMiraAudience } from './use-mira-audience';

/**
 * Shown where Mira is refused because the meeting workspace has not declared
 * an 18+ audience. People who may change that setting get a button to it in
 * the meeting settings, which open above whatever shows this message, so the
 * person returns to it afterwards. Everyone else is told who can change it.
 */
export function MiraWorkspaceOff({
  wsId,
  className,
}: {
  wsId?: string;
  className?: string;
}) {
  const t = useTranslations('meet.mira_adults');
  const openSettings = useOpenCallSettings();
  const audience = useMiraAudience(wsId);
  return (
    <div className={cn('grid justify-items-start gap-2', className)}>
      <p>{t('workspace_off')}</p>
      {openSettings && audience.setting?.attested === false ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-full"
          onClick={() => openSettings(MIRA_SETTINGS_TAB)}
        >
          <Settings2 className="size-4" />
          {t('open_settings')}
        </Button>
      ) : (
        audience.readOnly && (
          <p className="text-muted-foreground">{t('ask_owner')}</p>
        )
      )}
    </div>
  );
}
