'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useUpdateUserConfig, useUserConfig } from '@/hooks/use-user-config';

const USER_CONFIG_KEY = 'FINANCE_DEFAULT_ROUTE';
const WORKSPACE_CONFIG_KEY = 'finance_default_route';

// Special values for SelectItem (must be non-empty strings)
const OVERVIEW_VALUE = '_overview';
const USE_WORKSPACE_DEFAULT = '__workspace_default__';

// Route options available for finance module navigation
// These correspond to the finance children routes in navigation.tsx
export const FINANCE_ROUTE_OPTIONS = [
  { value: OVERVIEW_VALUE, labelKey: 'overview', routeSuffix: '' },
  {
    value: '/transactions',
    labelKey: 'transactions',
    routeSuffix: '/transactions',
  },
  { value: '/wallets', labelKey: 'wallets', routeSuffix: '/wallets' },
  { value: '/invoices', labelKey: 'invoices', routeSuffix: '/invoices' },
  {
    value: '/transactions/categories',
    labelKey: 'categories',
    routeSuffix: '/transactions/categories',
  },
  { value: '/tags', labelKey: 'tags', routeSuffix: '/tags' },
] as const;

export type FinanceRouteOption =
  (typeof FINANCE_ROUTE_OPTIONS)[number]['routeSuffix'];

// Helper to convert SelectItem value to route suffix for storage
const valueToRouteSuffix = (value: string): string => {
  if (value === OVERVIEW_VALUE) return '';
  return value;
};

// Helper to convert stored route suffix to SelectItem value
const routeSuffixToValue = (suffix: string): string => {
  if (suffix === '' || suffix === OVERVIEW_VALUE) return OVERVIEW_VALUE;
  return suffix;
};

interface Props {
  workspaceId: string;
}

export default function FinanceNavigationSettings({ workspaceId }: Props) {
  const t = useTranslations('settings.finance');
  const tFinanceTabs = useTranslations('workspace-finance-tabs');
  const tCommon = useTranslations('common');

  const queryClient = useQueryClient();

  // User-level config
  const { data: savedUserRoute, isLoading: isLoadingUserConfig } =
    useUserConfig(USER_CONFIG_KEY, USE_WORKSPACE_DEFAULT);
  const updateUserConfig = useUpdateUserConfig();

  // Workspace-level config
  const { data: savedWorkspaceRoute, isLoading: isLoadingWorkspaceConfig } =
    useWorkspaceConfig<string>(workspaceId, WORKSPACE_CONFIG_KEY, '');

  // User preference state (uses SelectItem values)
  const [selectedUserRoute, setSelectedUserRoute] = useState(
    USE_WORKSPACE_DEFAULT
  );
  const [initialUserRoute, setInitialUserRoute] = useState(
    USE_WORKSPACE_DEFAULT
  );
  const [userInitialized, setUserInitialized] = useState(false);

  // Workspace setting state (uses SelectItem values)
  const [selectedWorkspaceRoute, setSelectedWorkspaceRoute] =
    useState(OVERVIEW_VALUE);
  const [initialWorkspaceRoute, setInitialWorkspaceRoute] =
    useState(OVERVIEW_VALUE);
  const [workspaceInitialized, setWorkspaceInitialized] = useState(false);

  // Initialize user preference
  useEffect(() => {
    if (isLoadingUserConfig) return;

    // savedUserRoute is either USE_WORKSPACE_DEFAULT or a route suffix
    const route = savedUserRoute || USE_WORKSPACE_DEFAULT;
    // Convert route suffix to SelectItem value if not using workspace default
    const selectValue =
      route === USE_WORKSPACE_DEFAULT
        ? USE_WORKSPACE_DEFAULT
        : routeSuffixToValue(route);

    setInitialUserRoute(selectValue);
    if (!userInitialized) {
      setSelectedUserRoute(selectValue);
      setUserInitialized(true);
    }
  }, [isLoadingUserConfig, savedUserRoute, userInitialized]);

  // Initialize workspace setting
  useEffect(() => {
    if (isLoadingWorkspaceConfig) return;

    // savedWorkspaceRoute is a route suffix (empty string = overview)
    const selectValue = routeSuffixToValue(savedWorkspaceRoute || '');

    setInitialWorkspaceRoute(selectValue);
    if (!workspaceInitialized) {
      setSelectedWorkspaceRoute(selectValue);
      setWorkspaceInitialized(true);
    }
  }, [isLoadingWorkspaceConfig, savedWorkspaceRoute, workspaceInitialized]);

  const isUserDirty = selectedUserRoute !== initialUserRoute;
  const isWorkspaceDirty = selectedWorkspaceRoute !== initialWorkspaceRoute;

  // Workspace config mutation
  const updateWorkspaceConfig = useMutation({
    mutationFn: async () => {
      // Convert SelectItem value to route suffix for storage
      const routeSuffix = valueToRouteSuffix(selectedWorkspaceRoute);
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/${WORKSPACE_CONFIG_KEY}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: routeSuffix }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update workspace settings');
      }

      return res.json();
    },
    onSuccess: () => {
      setInitialWorkspaceRoute(selectedWorkspaceRoute);
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, WORKSPACE_CONFIG_KEY],
      });
      toast.success(t('navigation_update_success'));
    },
    onError: () => {
      toast.error(t('navigation_update_error'));
    },
  });

  const handleUserSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      // For user config: save workspace default marker as-is, or convert route suffix
      const valueToSave =
        selectedUserRoute === USE_WORKSPACE_DEFAULT
          ? USE_WORKSPACE_DEFAULT
          : valueToRouteSuffix(selectedUserRoute);

      await updateUserConfig.mutateAsync({
        configId: USER_CONFIG_KEY,
        value: valueToSave,
      });
      setInitialUserRoute(selectedUserRoute);
      toast.success(t('navigation_update_success'));
    } catch {
      toast.error(t('navigation_update_error'));
    }
  };

  const handleWorkspaceSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateWorkspaceConfig.mutate();
  };

  const isLoading = !userInitialized || !workspaceInitialized;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get the workspace default route label for display in "Use workspace default" option
  const getWorkspaceDefaultLabel = () => {
    const wsOption = FINANCE_ROUTE_OPTIONS.find(
      (o) => o.value === selectedWorkspaceRoute
    );
    return wsOption
      ? tFinanceTabs(wsOption.labelKey)
      : tFinanceTabs('overview');
  };

  return (
    <div className="space-y-8">
      {/* User Personal Preference Section */}
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="font-medium text-lg">
            {t('personal_navigation_title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('personal_navigation_description')}
          </p>
        </div>

        <form onSubmit={handleUserSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label>{t('personal_default_route_label')}</Label>
            <Select
              onValueChange={setSelectedUserRoute}
              value={selectedUserRoute}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('select_default_route')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={USE_WORKSPACE_DEFAULT}>
                  {t('use_workspace_default')} ({getWorkspaceDefaultLabel()})
                </SelectItem>
                {FINANCE_ROUTE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {tFinanceTabs(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t('personal_default_route_help')}
            </p>
          </div>

          <Button
            type="submit"
            disabled={
              isLoadingUserConfig || updateUserConfig.isPending || !isUserDirty
            }
          >
            {updateUserConfig.isPending
              ? tCommon('saving')
              : tCommon('save_changes')}
          </Button>
        </form>
      </div>

      <Separator />

      {/* Workspace Default Section */}
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="font-medium text-lg">
            {t('workspace_navigation_title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('workspace_navigation_description')}
          </p>
        </div>

        <form onSubmit={handleWorkspaceSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label>{t('workspace_default_route_label')}</Label>
            <Select
              onValueChange={setSelectedWorkspaceRoute}
              value={selectedWorkspaceRoute}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('select_default_route')} />
              </SelectTrigger>
              <SelectContent>
                {FINANCE_ROUTE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {tFinanceTabs(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t('workspace_default_route_help')}
            </p>
          </div>

          <Button
            type="submit"
            disabled={
              isLoadingWorkspaceConfig ||
              updateWorkspaceConfig.isPending ||
              !isWorkspaceDirty
            }
          >
            {updateWorkspaceConfig.isPending
              ? tCommon('saving')
              : tCommon('save_changes')}
          </Button>
        </form>
      </div>
    </div>
  );
}
