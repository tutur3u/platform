import type { LettinRole } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';

export type StudioMembership = 'all' | 'owned' | 'collaborating';

/** Filters only the actor's authorized overview; it never discovers membership. */
export function matchesStudioMembership(
  role: LettinRole,
  membership: StudioMembership
) {
  return (
    membership === 'all' ||
    (membership === 'owned'
      ? role === 'owner'
      : role === 'editor' || role === 'publisher')
  );
}

export function StudioMembershipFilter({
  value,
  onChange,
}: {
  value: StudioMembership;
  onChange: (value: StudioMembership) => void;
}) {
  const t = useTranslations('lettin');
  return (
    <fieldset
      className="studio-filters my-4 flex-wrap"
      aria-label={t('studioMembership')}
    >
      <legend className="sr-only">{t('studioMembership')}</legend>
      {(['all', 'owned', 'collaborating'] as const).map((membership) => (
        <button
          key={membership}
          type="button"
          aria-pressed={value === membership}
          onClick={() => onChange(membership)}
        >
          {t(`studioMembership_${membership}`)}
        </button>
      ))}
    </fieldset>
  );
}
