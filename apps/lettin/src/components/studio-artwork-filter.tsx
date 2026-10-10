'use client';
import { useTranslations } from 'next-intl';

export type StudioArtwork = 'all' | 'with' | 'without';

export function matchesStudioArtwork(image: string, filter: StudioArtwork) {
  return filter === 'all' || (filter === 'with' ? !!image : !image);
}

export function StudioArtworkFilter({
  value,
  onChange,
}: {
  value: StudioArtwork;
  onChange: (value: StudioArtwork) => void;
}) {
  const t = useTranslations('lettin');
  return (
    <fieldset
      className="studio-filters mb-5 flex flex-wrap gap-2"
      aria-label={t('studioArtwork')}
    >
      {(['all', 'with', 'without'] as const).map((filter) => (
        <button
          key={filter}
          type="button"
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
        >
          {t(`studioArtwork_${filter}`)}
        </button>
      ))}
    </fieldset>
  );
}
