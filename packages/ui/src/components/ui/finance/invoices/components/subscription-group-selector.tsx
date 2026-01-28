'use client';

import { Loader2 } from '@tuturuuu/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { useTranslations } from 'next-intl';

interface SubscriptionGroupSelectorProps {
  t: ReturnType<typeof useTranslations>;
  userGroups: any[];
  userGroupsLoading: boolean;
  selectedGroupIds: string[];
  activeGroupId: string;
  onGroupSelect: (groupId: string) => void;
  isLoadingSubscriptionData: boolean;
  locale: string;
}

export function SubscriptionGroupSelector({
  t,
  userGroups,
  userGroupsLoading,
  selectedGroupIds,
  activeGroupId,
  onGroupSelect,
  isLoadingSubscriptionData,
  locale,
}: SubscriptionGroupSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ws-invoices.user_groups')}</CardTitle>
        <CardDescription>
          {t('ws-invoices.user_groups_description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {userGroupsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-muted-foreground text-sm">
                {t('ws-invoices.loading_groups')}
              </p>
            </div>
          </div>
        ) : userGroups.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t('ws-invoices.no_groups_found')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {userGroups.map((groupItem) => {
              const group = groupItem.workspace_user_groups;
              if (!group) return null;

              const isSelected = selectedGroupIds.includes(group.id);

              return (
                <button
                  type="button"
                  key={group.id}
                  className={`w-full cursor-pointer rounded-lg border p-4 text-left transition-colors ${
                    activeGroupId === group.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => onGroupSelect(group.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{group.name}</h3>
                        {isLoadingSubscriptionData &&
                          activeGroupId === group.id && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {group.starting_date && (
                          <p className="text-muted-foreground text-sm">
                            {t('ws-invoices.started')}:{' '}
                            {new Date(group.starting_date).toLocaleDateString(
                              locale
                            )}
                          </p>
                        )}
                        {group.ending_date && (
                          <p className="text-muted-foreground text-sm">
                            {t('ws-invoices.ends')}:{' '}
                            {new Date(group.ending_date).toLocaleDateString(
                              locale
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[10px] text-primary uppercase tracking-wide">
                            {t('common.selected')}
                          </span>
                        )}
                        {activeGroupId === group.id && (
                          <div className="h-4 w-4 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
