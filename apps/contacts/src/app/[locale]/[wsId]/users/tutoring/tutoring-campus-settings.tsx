'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import {
  getTutoringCampusChoices,
  TUTORING_CAMPUS_LABEL_MAX_LENGTH,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';

interface Props {
  canConfigure: boolean;
  groups: UserGroup[];
  onChange: (next: Partial<TutoringPolicy>) => void;
  policy: TutoringPolicy;
}

export function TutoringCampusSettings({
  canConfigure,
  groups,
  onChange,
  policy,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const options = policy.campusOptions;
  // Mapped labels missing from the list stay selectable so they are kept.
  const choices = getTutoringCampusChoices(policy).map((label) => ({
    label,
    value: label,
  }));
  const setMapping = (groupId: string, label: string) =>
    onChange({
      campusByGroupId: { ...policy.campusByGroupId, [groupId]: label },
    });

  return (
    <>
      <div>
        <h3 className="font-medium">{t('policy_campuses')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('policy_campuses_description')}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium text-sm">{t('policy_campus_options')}</h4>
        <p className="text-muted-foreground text-xs">
          {t('policy_campus_options_description')}
        </p>
        {options.map((label, index) => (
          <div className="flex items-center gap-2" key={index}>
            <Input
              aria-label={t('policy_campus_option_label')}
              disabled={!canConfigure}
              maxLength={TUTORING_CAMPUS_LABEL_MAX_LENGTH}
              onChange={(event) =>
                onChange({
                  campusOptions: options.map((current, position) =>
                    position === index ? event.target.value : current
                  ),
                })
              }
              placeholder={t('policy_campus_name')}
              value={label}
            />
            {canConfigure ? (
              <Button
                aria-label={t('policy_remove_campus_option')}
                onClick={() =>
                  onChange({
                    campusOptions: options.filter(
                      (_, position) => position !== index
                    ),
                  })
                }
                size="icon"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
        {canConfigure ? (
          <Button
            onClick={() => onChange({ campusOptions: [...options, ''] })}
            size="sm"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            {t('policy_add_campus_option')}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <h4 className="font-medium text-sm">{t('policy_class_campuses')}</h4>
        {Object.entries(policy.campusByGroupId).map(([groupId, name]) => (
          <div className="flex items-end gap-2" key={groupId}>
            <div className="min-w-0 flex-1 space-y-1">
              <Label>
                {groups.find((group) => group.id === groupId)?.name ?? groupId}
              </Label>
              <Combobox
                ariaLabel={groups.find((group) => group.id === groupId)?.name}
                createText={t('policy_use_campus_label')}
                disabled={!canConfigure}
                emptyText={t('policy_no_campus_options')}
                onChange={(value) => setMapping(groupId, value as string)}
                onCreate={(value) =>
                  setMapping(
                    groupId,
                    value.trim().slice(0, TUTORING_CAMPUS_LABEL_MAX_LENGTH)
                  )
                }
                options={choices}
                placeholder={t('policy_campus_name')}
                searchPlaceholder={t('policy_search_campuses')}
                selected={name}
              />
            </div>
            {canConfigure ? (
              <Button
                aria-label={t('policy_remove_campus')}
                onClick={() => {
                  const next = { ...policy.campusByGroupId };
                  delete next[groupId];
                  onChange({ campusByGroupId: next });
                }}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
        {canConfigure ? (
          <Combobox
            emptyText={t('no_groups')}
            onChange={(value) => setMapping(value as string, '')}
            options={groups
              .filter((group) => !(group.id in policy.campusByGroupId))
              .map((group) => ({
                label: group.name || group.id,
                value: group.id,
              }))}
            placeholder={t('policy_add_campus')}
            searchPlaceholder={t('search_groups')}
            selected=""
          />
        ) : null}
      </div>
    </>
  );
}
