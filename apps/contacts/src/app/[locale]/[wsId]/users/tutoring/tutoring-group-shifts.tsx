'use client';

import { Trash2 } from '@tuturuuu/icons';
import type { TutoringPolicy } from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

/** Named shift labels, deduplicated; unlabelled rules cannot be assigned. */
export function tutoringShiftLabels(policy: TutoringPolicy) {
  return [
    ...new Set(
      policy.timeRules
        .map((rule) => rule.label?.trim())
        .filter((label): label is string => Boolean(label))
    ),
  ];
}

export function TutoringGroupShifts({
  canConfigure,
  groups,
  onChange,
  policy,
}: {
  canConfigure: boolean;
  groups: UserGroup[];
  onChange: (next: Partial<TutoringPolicy>) => void;
  policy: TutoringPolicy;
}) {
  const t = useTranslations('ws-tutoring');
  const labels = tutoringShiftLabels(policy);
  const assign = (groupId: string, label: string) =>
    onChange({
      shiftByGroupId: { ...policy.shiftByGroupId, [groupId]: label },
    });

  return (
    <>
      <div>
        <h3 className="font-medium">{t('policy_group_shifts')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('policy_group_shifts_description')}
        </p>
      </div>
      {Object.entries(policy.shiftByGroupId).map(([groupId, label]) => (
        <div className="flex items-end gap-2" key={groupId}>
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`policy-shift-${groupId}`}>
              {groups.find((group) => group.id === groupId)?.name ?? groupId}
            </Label>
            <Select
              disabled={!canConfigure}
              onValueChange={(value) => assign(groupId, value)}
              value={label}
            >
              <SelectTrigger id={`policy-shift-${groupId}`}>
                <SelectValue placeholder={t('policy_group_shift_select')} />
              </SelectTrigger>
              <SelectContent>
                {labels.includes(label) ? null : (
                  <SelectItem disabled value={label}>
                    {t('policy_group_shift_unknown', { label })}
                  </SelectItem>
                )}
                {labels.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canConfigure ? (
            <Button
              aria-label={t('policy_remove_group_shift')}
              onClick={() => {
                const next = { ...policy.shiftByGroupId };
                delete next[groupId];
                onChange({ shiftByGroupId: next });
              }}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ))}
      {canConfigure && labels[0] ? (
        <Combobox
          emptyText={t('no_groups')}
          onChange={(value) => assign(value as string, labels[0] as string)}
          options={groups
            .filter((group) => !(group.id in policy.shiftByGroupId))
            .map((group) => ({
              label: group.name || group.id,
              value: group.id,
            }))}
          placeholder={t('policy_add_group_shift')}
          searchPlaceholder={t('search_groups')}
          selected=""
        />
      ) : null}
    </>
  );
}
