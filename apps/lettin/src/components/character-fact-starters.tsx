'use client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const labels = [
  'appearance',
  'personality',
  'motivation',
  'abilities',
] as const;
export function CharacterFactStarters({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (label: string) => void;
}) {
  const t = useTranslations('lettin');
  const [choice, setChoice] = useState('');
  const selected = labels.find((label) => label === choice);
  return (
    <div className="mb-4 space-y-2">
      <label className="block space-y-2 text-sm">
        {t('characterFactStarter')}
        <select
          className="block w-full rounded border border-input bg-background p-2"
          value={choice}
          disabled={disabled}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">{t('characterFactChoose')}</option>
          {labels.map((label) => (
            <option key={label} value={label}>
              {t(`characterFact_${label}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-muted-foreground text-xs">
        {t('characterFactStarterHint')}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || !selected}
        onClick={() => {
          if (disabled || !selected) return;
          onAdd(t(`characterFact_${selected}`));
          setChoice('');
        }}
      >
        {t('characterFactAdd')}
      </Button>
    </div>
  );
}
