'use client';

import type { TutoringPolicy } from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { useTranslations } from 'next-intl';

interface Props {
  canConfigure: boolean;
  groups: UserGroup[];
  onChange: (next: Partial<TutoringPolicy>) => void;
  policy: TutoringPolicy;
}

export function TutoringSupportGroups({
  canConfigure,
  groups,
  onChange,
  policy,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const known = new Set(groups.map((group) => group.id));
  // A deleted group stays listed by id so it can still be removed.
  const options = [
    ...groups.map((group) => ({
      label: group.name || group.id,
      value: group.id,
    })),
    ...policy.supportGroupIds
      .filter((id) => !known.has(id))
      .map((id) => ({ label: id, value: id })),
  ];

  return (
    <section className="space-y-2">
      <div>
        <h3 className="font-medium">{t('policy_support_groups')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('policy_support_groups_description')}
        </p>
      </div>
      <Combobox
        ariaLabel={t('policy_support_groups')}
        disabled={!canConfigure}
        emptyText={t('no_groups')}
        mode="multiple"
        onChange={(value) => onChange({ supportGroupIds: value as string[] })}
        options={options}
        placeholder={t('policy_select_support_groups')}
        searchPlaceholder={t('search_groups')}
        selected={policy.supportGroupIds}
      />
    </section>
  );
}
