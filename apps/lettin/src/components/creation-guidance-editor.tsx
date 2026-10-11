'use client';
import type { LettinCreationGuidance } from '@tuturuuu/internal-api/lettin';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { collaborationPreferences } from '../creation-guidance';

export function CreationGuidanceEditor({
  value,
  onChange,
}: {
  value?: LettinCreationGuidance;
  onChange: (value: LettinCreationGuidance) => void;
}) {
  const t = useTranslations('lettin');
  const current: LettinCreationGuidance = value ?? {
    credits: '',
    usageNotes: '',
    collaboration: 'unspecified',
  };
  return (
    <fieldset className="space-y-4 rounded border border-border p-4">
      <legend className="px-2 font-semibold">{t('creationGuidance')}</legend>
      <p className="text-muted-foreground text-sm">
        {t('creationGuidanceHint')}
      </p>
      <label className="block space-y-2 text-sm">
        {t('creationCredits')}
        <Textarea
          value={current.credits}
          maxLength={1000}
          onChange={(event) =>
            onChange({ ...current, credits: event.target.value })
          }
        />
      </label>
      <label className="block space-y-2 text-sm">
        {t('creationUsageNotes')}
        <Textarea
          value={current.usageNotes}
          maxLength={1000}
          onChange={(event) =>
            onChange({ ...current, usageNotes: event.target.value })
          }
        />
      </label>
      <label className="block space-y-2 text-sm">
        {t('creationCollaboration')}
        <select
          className="block w-full rounded border border-input bg-background p-2"
          value={current.collaboration}
          onChange={(event) => {
            const preference = collaborationPreferences.find(
              (item) => item === event.target.value
            );
            if (preference) onChange({ ...current, collaboration: preference });
          }}
        >
          {collaborationPreferences.map((preference) => (
            <option key={preference} value={preference}>
              {t(`creationCollaboration_${preference}`)}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
