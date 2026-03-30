'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useUpdateUserConfig, useUserConfig } from '@/hooks/use-user-config';
import {
  DATABASE_DEFAULT_GROUP_MEMBERSHIP_CONFIG_ID,
  DATABASE_DEFAULT_LINK_STATUS_CONFIG_ID,
  type DatabaseGroupMembership,
  type DatabaseLinkStatus,
  DEFAULT_DATABASE_GROUP_MEMBERSHIP,
  DEFAULT_DATABASE_LINK_STATUS,
  getDatabaseGroupMembershipTranslationKey,
} from '@/lib/users-database-filters';

export function DatabaseDefaultFiltersSettings() {
  const t = useTranslations('settings.user_management');
  const usersT = useTranslations('ws-users');
  const updateUserConfig = useUpdateUserConfig();

  const { data: savedLinkStatus, isLoading: isLoadingLinkStatus } =
    useUserConfig(
      DATABASE_DEFAULT_LINK_STATUS_CONFIG_ID,
      DEFAULT_DATABASE_LINK_STATUS
    );
  const { data: savedGroupMembership, isLoading: isLoadingGroupMembership } =
    useUserConfig(
      DATABASE_DEFAULT_GROUP_MEMBERSHIP_CONFIG_ID,
      DEFAULT_DATABASE_GROUP_MEMBERSHIP
    );

  const [linkStatus, setLinkStatus] = useState<DatabaseLinkStatus>(
    DEFAULT_DATABASE_LINK_STATUS
  );
  const [initialLinkStatus, setInitialLinkStatus] =
    useState<DatabaseLinkStatus>(DEFAULT_DATABASE_LINK_STATUS);
  const [groupMembership, setGroupMembership] =
    useState<DatabaseGroupMembership>(DEFAULT_DATABASE_GROUP_MEMBERSHIP);
  const [initialGroupMembership, setInitialGroupMembership] =
    useState<DatabaseGroupMembership>(DEFAULT_DATABASE_GROUP_MEMBERSHIP);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoadingLinkStatus || isLoadingGroupMembership) {
      return;
    }

    const nextLinkStatus =
      savedLinkStatus === 'linked' || savedLinkStatus === 'virtual'
        ? savedLinkStatus
        : DEFAULT_DATABASE_LINK_STATUS;
    const nextGroupMembership =
      savedGroupMembership === 'at-least-one' ||
      savedGroupMembership === 'exactly-one' ||
      savedGroupMembership === 'none'
        ? savedGroupMembership
        : DEFAULT_DATABASE_GROUP_MEMBERSHIP;

    setInitialLinkStatus(nextLinkStatus);
    setInitialGroupMembership(nextGroupMembership);

    if (!initialized) {
      setLinkStatus(nextLinkStatus);
      setGroupMembership(nextGroupMembership);
      setInitialized(true);
    }
  }, [
    initialized,
    isLoadingGroupMembership,
    isLoadingLinkStatus,
    savedGroupMembership,
    savedLinkStatus,
  ]);

  const isDirty =
    linkStatus !== initialLinkStatus ||
    groupMembership !== initialGroupMembership;

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await updateUserConfig.mutateAsync({
        configId: DATABASE_DEFAULT_LINK_STATUS_CONFIG_ID,
        value: linkStatus,
      });
      await updateUserConfig.mutateAsync({
        configId: DATABASE_DEFAULT_GROUP_MEMBERSHIP_CONFIG_ID,
        value: groupMembership,
      });

      setInitialLinkStatus(linkStatus);
      setInitialGroupMembership(groupMembership);
      toast.success(t('update_success'));
    } catch {
      toast.error(t('update_error'));
    }
  };

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSave}>
      <div className="space-y-2">
        <h3 className="font-medium text-lg">
          {t('personal_database_filters')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('personal_database_filters_description')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border p-4">
          <Label>{t('default_link_status')}</Label>
          <Select
            value={linkStatus}
            onValueChange={(value) =>
              setLinkStatus(value as DatabaseLinkStatus)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('default_link_status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{usersT('link_status_all')}</SelectItem>
              <SelectItem value="linked">
                {usersT('link_status_linked')}
              </SelectItem>
              <SelectItem value="virtual">
                {usersT('link_status_virtual')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t('default_link_status_help')}
          </p>
        </div>

        <div className="space-y-2 rounded-lg border p-4">
          <Label>{t('default_group_membership')}</Label>
          <Select
            value={groupMembership}
            onValueChange={(value) =>
              setGroupMembership(value as DatabaseGroupMembership)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('default_group_membership')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {usersT(getDatabaseGroupMembershipTranslationKey('all'))}
              </SelectItem>
              <SelectItem value="at-least-one">
                {usersT(
                  getDatabaseGroupMembershipTranslationKey('at-least-one')
                )}
              </SelectItem>
              <SelectItem value="exactly-one">
                {usersT(
                  getDatabaseGroupMembershipTranslationKey('exactly-one')
                )}
              </SelectItem>
              <SelectItem value="none">
                {usersT(getDatabaseGroupMembershipTranslationKey('none'))}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t('default_group_membership_help')}
          </p>
        </div>
      </div>

      <Button type="submit" disabled={!isDirty || updateUserConfig.isPending}>
        {updateUserConfig.isPending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
