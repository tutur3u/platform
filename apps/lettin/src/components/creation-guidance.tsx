import type { LettinCreationGuidance } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { collaborationPreferences } from '../creation-guidance';

export function CreationGuidance({
  value,
}: {
  value?: LettinCreationGuidance;
}) {
  const t = useTranslations('lettin');
  if (!value) return null;
  const preference = collaborationPreferences.includes(value.collaboration)
    ? value.collaboration
    : 'unspecified';
  if (
    !value.credits.trim() &&
    !value.usageNotes.trim() &&
    preference === 'unspecified'
  )
    return null;
  return (
    <section
      aria-label={t('creationGuidance')}
      className="my-6 space-y-3 rounded border border-border p-4"
    >
      <h2 className="font-semibold">{t('creationGuidance')}</h2>
      {value.credits.trim() && (
        <div>
          <h3 className="font-semibold text-sm">{t('creationCredits')}</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {value.credits}
          </p>
        </div>
      )}
      {value.usageNotes.trim() && (
        <div>
          <h3 className="font-semibold text-sm">{t('creationUsageNotes')}</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {value.usageNotes}
          </p>
        </div>
      )}
      {preference !== 'unspecified' && (
        <p className="text-sm">
          {t('creationCollaboration')}:{' '}
          {t(`creationCollaboration_${preference}`)}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        {t('creationGuidanceAdvisory')}
      </p>
    </section>
  );
}
