'use client';

import { CreditCard, ShieldUser, UserPlus } from '@tuturuuu/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';

type AccessPreset = 'guest' | 'member' | 'pos_operator';

const OPTIONS: Array<{
  descriptionKey: string;
  icon: typeof UserPlus;
  labelKey: string;
  shortLabelKey: string;
  value: AccessPreset;
}> = [
  {
    descriptionKey: 'ws-members.invite_membership_member_description',
    icon: UserPlus,
    labelKey: 'ws-members.invite_membership_member',
    shortLabelKey: 'ws-members.invite_access_member_tab',
    value: 'member',
  },
  {
    descriptionKey: 'ws-members.invite_membership_guest_description',
    icon: ShieldUser,
    labelKey: 'ws-members.invite_membership_guest',
    shortLabelKey: 'ws-members.invite_access_guest_tab',
    value: 'guest',
  },
  {
    descriptionKey: 'ws-members.pos_operator_description',
    icon: CreditCard,
    labelKey: 'ws-members.invite_membership_pos_operator',
    shortLabelKey: 'ws-members.invite_access_pos_tab',
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
  const options = canManageRoles
    ? OPTIONS
    : OPTIONS.filter((option) => option.value !== 'pos_operator');

  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">
        {t('ws-members.invite_membership_label')}
      </p>
      <Tabs
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as AccessPreset)}
      >
        <TabsList
          aria-label={t('ws-members.invite_membership_label')}
          className={`grid h-auto w-full gap-1 rounded-xl bg-muted/60 p-1 ${canManageRoles ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          {options.map((option) => {
            const Icon = option.icon;

            return (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="min-h-10 min-w-0 rounded-lg px-2.5 py-2 data-[state=active]:text-dynamic-blue"
              >
                <Icon className="size-4" />
                <span className="truncate">{t(option.shortLabelKey)}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {options.map((option) => {
          const Icon = option.icon;

          return (
            <TabsContent
              key={option.value}
              value={option.value}
              className="mt-1 rounded-xl border bg-background px-3.5 py-3"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-dynamic-blue">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{t(option.labelKey)}</p>
                  <p className="mt-0.5 text-muted-foreground text-xs leading-5">
                    {t(option.descriptionKey)}
                  </p>
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
