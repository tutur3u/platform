import { useQuery } from '@tanstack/react-query';
import { Linking } from 'react-native';

import { queryKeys } from '@/lib/query';
import {
  checkAppVersion,
  getCurrentVersion,
  type VersionCheckResult,
} from '@/services/version-check';

/**
 * Hook for checking app version and handling updates
 *
 * @example
 * ```typescript
 * function App() {
 *   const { status, showUpdatePrompt, openStore } = useVersionCheck();
 *
 *   if (status === 'force_update') {
 *     return <ForceUpdateScreen onUpdate={openStore} />;
 *   }
 *
 *   if (showUpdatePrompt) {
 *     return (
 *       <UpdateBanner
 *         onUpdate={openStore}
 *         onDismiss={() => dismissUpdate()}
 *       />
 *     );
 *   }
 *
 *   return <MainApp />;
 * }
 * ```
 */
export function useVersionCheck() {
  const {
    data,
    isLoading,
    error,
    refetch: checkForUpdates,
  } = useQuery<VersionCheckResult>({
    queryKey: queryKeys.version.check(),
    queryFn: () => checkAppVersion(),
    // Check once per session, or every 24 hours if app stays open
    staleTime: 24 * 60 * 60 * 1000,
    // Cache for 7 days
    gcTime: 7 * 24 * 60 * 60 * 1000,
    // Don't retry - version check is not critical
    retry: false,
    // Check on mount
    refetchOnMount: 'always',
  });

  const openStore = async () => {
    if (data?.updateUrl) {
      const canOpen = await Linking.canOpenURL(data.updateUrl);
      if (canOpen) {
        await Linking.openURL(data.updateUrl);
      }
    }
  };

  return {
    // Version info
    currentVersion: getCurrentVersion(),
    latestVersion: data?.latestVersion ?? null,
    minimumVersion: data?.minimumVersion ?? null,

    // Status
    status: data?.status ?? 'current',
    isUpdateAvailable: data?.status === 'update_available',
    isForceUpdateRequired: data?.status === 'force_update',
    message: data?.message ?? null,

    // Loading state
    isLoading,
    error,

    // Actions
    openStore,
    checkForUpdates,
  };
}
