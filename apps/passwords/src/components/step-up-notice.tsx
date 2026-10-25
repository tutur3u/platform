import { Lock } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { useI18n } from '../i18n/provider';
import { PASSWORDS_LIMITS } from '../service/port';

/** Leaves for the central MFA step-up page; the app never handles the code. */
export function StepUpNotice({ url }: { url: string }) {
  const { t } = useI18n();
  return (
    <Alert>
      <Lock className="h-4 w-4" />
      <AlertTitle>{t('stepUp.title')}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {t('stepUp.body', {
            minutes: PASSWORDS_LIMITS.stepUpMaxAgeSeconds / 60,
          })}
        </span>
        <Button asChild size="sm">
          <a href={url}>{t('stepUp.action')}</a>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
