'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  useUpdateUserConfig,
  useUserBooleanConfig,
} from '@/hooks/use-user-config';

const USER_CONFIG_KEY = 'FINANCE_SHOW_INVOICES';
const WORKSPACE_CONFIG_KEY = 'finance_show_invoices';

// Special value to indicate "use workspace default"
const USE_WORKSPACE_DEFAULT = '__workspace_default__';

interface Props {
  workspaceId: string;
  isPersonalWorkspace?: boolean;
}

export default function InvoiceVisibilitySettings({
  workspaceId,
  isPersonalWorkspace = false,
}: Props) {
  const t = useTranslations('settings.finance');
  const tCommon = useTranslations('common');

  const queryClient = useQueryClient();

  // Default: disabled for personal, enabled for non-personal
  const workspaceDefault = !isPersonalWorkspace;

  // User-level config (string: 'true', 'false', or USE_WORKSPACE_DEFAULT)
  const { value: savedUserValue, isLoading: isLoadingUserConfig } =
    useUserBooleanConfig(USER_CONFIG_KEY, undefined);
  const updateUserConfig = useUpdateUserConfig();

  // Workspace-level config
  const { data: savedWorkspaceValue, isLoading: isLoadingWorkspaceConfig } =
    useWorkspaceConfig<boolean>(
      workspaceId,
      WORKSPACE_CONFIG_KEY,
      workspaceDefault
    );

  // User preference state
  const [useWorkspaceDefaultUser, setUseWorkspaceDefaultUser] = useState(true);
  const [userEnabled, setUserEnabled] = useState(true);
  const [userInitialized, setUserInitialized] = useState(false);

  // Workspace setting state
  const [workspaceEnabled, setWorkspaceEnabled] = useState(workspaceDefault);
  const [initialWorkspaceEnabled, setInitialWorkspaceEnabled] =
    useState(workspaceDefault);
  const [workspaceInitialized, setWorkspaceInitialized] = useState(false);

  // Initialize user preference
  useEffect(() => {
    if (isLoadingUserConfig) return;

    // If savedUserValue is undefined, user hasn't set a preference yet
    if (savedUserValue === undefined) {
      setUseWorkspaceDefaultUser(true);
      setUserEnabled(true);
    } else {
      setUseWorkspaceDefaultUser(false);
      setUserEnabled(savedUserValue);
    }

    if (!userInitialized) {
      setUserInitialized(true);
    }
  }, [isLoadingUserConfig, savedUserValue, userInitialized]);

  // Initialize workspace setting
  useEffect(() => {
    if (isLoadingWorkspaceConfig) return;

    const enabled = savedWorkspaceValue ?? workspaceDefault;
    setInitialWorkspaceEnabled(enabled);
    if (!workspaceInitialized) {
      setWorkspaceEnabled(enabled);
      setWorkspaceInitialized(true);
    }
  }, [
    isLoadingWorkspaceConfig,
    savedWorkspaceValue,
    workspaceDefault,
    workspaceInitialized,
  ]);

  const isWorkspaceDirty = workspaceEnabled !== initialWorkspaceEnabled;

  // Workspace config mutation
  const updateWorkspaceConfig = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/settings/${WORKSPACE_CONFIG_KEY}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: enabled }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update workspace settings');
      }

      return res.json();
    },
    onSuccess: (_, enabled) => {
      setInitialWorkspaceEnabled(enabled);
      queryClient.invalidateQueries({
        queryKey: ['workspace-config', workspaceId, WORKSPACE_CONFIG_KEY],
      });
      toast.success(t('invoices_visibility_update_success'));
    },
    onError: () => {
      toast.error(t('invoices_visibility_update_error'));
    },
  });

  const handleUserToggle = async (enabled: boolean) => {
    setUserEnabled(enabled);
    setUseWorkspaceDefaultUser(false);

    try {
      await updateUserConfig.mutateAsync({
        configId: USER_CONFIG_KEY,
        value: enabled.toString(),
      });
      toast.success(t('invoices_visibility_update_success'));
    } catch {
      toast.error(t('invoices_visibility_update_error'));
    }
  };

  const handleUseWorkspaceDefault = async () => {
    setUseWorkspaceDefaultUser(true);

    try {
      // Delete the user config to use workspace default
      await updateUserConfig.mutateAsync({
        configId: USER_CONFIG_KEY,
        value: USE_WORKSPACE_DEFAULT,
      });
      toast.success(t('invoices_visibility_update_success'));
    } catch {
      toast.error(t('invoices_visibility_update_error'));
    }
  };

  const handleWorkspaceToggle = (enabled: boolean) => {
    setWorkspaceEnabled(enabled);
  };

  const handleWorkspaceSave = () => {
    updateWorkspaceConfig.mutate(workspaceEnabled);
  };

  const isLoading = !userInitialized || !workspaceInitialized;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Compute effective value for display
  const effectiveEnabled = useWorkspaceDefaultUser
    ? (savedWorkspaceValue ?? workspaceDefault)
    : userEnabled;

  return (
    <div className="space-y-8">
      {/* User Personal Preference Section */}
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="font-medium text-lg">
            {t('personal_invoices_title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('personal_invoices_description')}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('use_workspace_default_invoices')}</Label>
              <p className="text-muted-foreground text-xs">
                {t('use_workspace_default_invoices_help', {
                  status:
                    (savedWorkspaceValue ?? workspaceDefault)
                      ? tCommon('enabled').toLowerCase()
                      : (tCommon as (key: string) => string)(
                          'disabled'
                        ).toLowerCase(),
                })}
              </p>
            </div>
            <Switch
              checked={useWorkspaceDefaultUser}
              onCheckedChange={(checked) => {
                if (checked) {
                  handleUseWorkspaceDefault();
                } else {
                  // When disabling "use workspace default", set to current effective value
                  handleUserToggle(effectiveEnabled);
                }
              }}
              disabled={updateUserConfig.isPending}
            />
          </div>

          {!useWorkspaceDefaultUser && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>{t('show_invoices_label')}</Label>
                <p className="text-muted-foreground text-xs">
                  {t('show_invoices_personal_help')}
                </p>
              </div>
              <Switch
                checked={userEnabled}
                onCheckedChange={handleUserToggle}
                disabled={updateUserConfig.isPending}
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Workspace Default Section */}
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="font-medium text-lg">
            {t('workspace_invoices_title')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('workspace_invoices_description')}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>{t('show_invoices_label')}</Label>
              <p className="text-muted-foreground text-xs">
                {t('show_invoices_workspace_help')}
              </p>
            </div>
            <Switch
              checked={workspaceEnabled}
              onCheckedChange={handleWorkspaceToggle}
              disabled={updateWorkspaceConfig.isPending}
            />
          </div>

          {isWorkspaceDirty && (
            <button
              type="button"
              onClick={handleWorkspaceSave}
              disabled={updateWorkspaceConfig.isPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm shadow hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {updateWorkspaceConfig.isPending
                ? tCommon('saving')
                : tCommon('save_changes')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
