'use client';

import { CreditCard, ShieldUser, UserPlus } from '@tuturuuu/icons';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';

type AccessPreset = 'guest' | 'member' | 'pos_operator';

const OPTIONS: Array<{
  descriptionKey: string;
  icon: typeof UserPlus;
  labelKey: string;
  value: AccessPreset;
}> = [
  {
    descriptionKey: 'ws-members.invite_membership_member_description',
    icon: UserPlus,
    labelKey: 'ws-members.invite_membership_member',
    value: 'member',
  },
  {
    descriptionKey: 'ws-members.invite_membership_guest_description',
    icon: ShieldUser,
    labelKey: 'ws-members.invite_membership_guest',
    value: 'guest',
  },
  {
    descriptionKey: 'ws-members.pos_operator_description',
    icon: CreditCard,
    labelKey: 'ws-members.invite_membership_pos_operator',
    value: 'pos_operator',
  },
];

export function WorkspaceAccessInviteAccessPicker({
  canManageRoles,
  onChange,
  value,
}: {
  canManageRoles: boolean;
  onChange: (value: AccessPreset) => void;
  value: AccessPreset;
}) {
  const t = useTranslations() as (key: string) => string;

  return (
    <fieldset className="space-y-3">
      <legend className="font-medium text-sm">
        {t('ws-members.invite_membership_label')}
      </legend>
      <RadioGroup
        className="gap-2"
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as AccessPreset)}
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const disabled = option.value === 'pos_operator' && !canManageRoles;
          const selected = option.value === value;

          return (
            <label
              key={option.value}
              className={`group flex items-start gap-3 rounded-xl border p-3 transition-colors active:scale-[0.99] ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${selected ? 'border-dynamic-blue/40 bg-dynamic-blue/5' : 'hover:border-foreground/20 hover:bg-muted/30'}`}
            >
              <span
                className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-dynamic-blue/25 bg-background text-dynamic-blue' : 'bg-muted/40 text-muted-foreground'}`}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm">
                  {t(option.labelKey)}
                </span>
                <span className="mt-0.5 block text-muted-foreground text-xs leading-4">
                  {t(option.descriptionKey)}
                </span>
              </span>
              <RadioGroupItem
                aria-label={t(option.labelKey)}
                className="mt-1"
                disabled={disabled}
                value={option.value}
              />
            </label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
