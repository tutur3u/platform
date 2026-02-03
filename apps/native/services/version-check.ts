import * as Application from 'expo-application';
import { Platform } from 'react-native';

export type VersionStatus = 'current' | 'update_available' | 'force_update';

export type VersionCheckResult = {
  status: VersionStatus;
  currentVersion: string;
  latestVersion: string | null;
  minimumVersion: string | null;
  updateUrl: string | null;
  message: string | null;
};

/**
 * Compares two semantic version strings
 * @returns negative if v1 < v2, 0 if equal, positive if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 !== p2) return p1 - p2;
  }
  return 0;
}

/**
 * Gets the current app version
 */
export function getCurrentVersion(): string {
  return Application.nativeApplicationVersion ?? '0.0.1';
}

/**
 * Gets the store URL for the current platform
 */
function getStoreUrl(): string {
  if (Platform.OS === 'ios') {
    // Replace with actual App Store URL when published
    return 'https://apps.apple.com/app/tuturuuu/id123456789';
  }
  // Replace with actual Play Store URL when published
  return 'https://play.google.com/store/apps/details?id=com.tuturuuu.native';
}

/**
 * Checks if the current app version is up to date
 *
 * This calls a backend endpoint to get version requirements.
 * The backend should return:
 * - latestVersion: The newest available version
 * - minimumVersion: The minimum supported version (force update if below)
 *
 * @example
 * ```typescript
 * const result = await checkAppVersion();
 * if (result.status === 'force_update') {
 *   showForceUpdateDialog(result);
 * } else if (result.status === 'update_available') {
 *   showOptionalUpdateBanner(result);
 * }
 * ```
 */
export async function checkAppVersion(
  apiBaseUrl?: string
): Promise<VersionCheckResult> {
  const currentVersion = getCurrentVersion();
  const baseUrl =
    apiBaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('/rest/v1', '');

  // Default result if API fails
  const defaultResult: VersionCheckResult = {
    status: 'current',
    currentVersion,
    latestVersion: null,
    minimumVersion: null,
    updateUrl: getStoreUrl(),
    message: null,
  };

  if (!baseUrl) {
    return defaultResult;
  }

  try {
    const response = await fetch(`${baseUrl}/api/app-version`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': Platform.OS,
        'X-App-Version': currentVersion,
      },
    });

    if (!response.ok) {
      // API not available, assume version is current
      return defaultResult;
    }

    const data = (await response.json()) as {
      latestVersion?: string;
      minimumVersion?: string;
      message?: string;
    };

    const latestVersion = data.latestVersion ?? currentVersion;
    const minimumVersion = data.minimumVersion ?? '0.0.0';

    // Check if force update required
    if (compareVersions(currentVersion, minimumVersion) < 0) {
      return {
        status: 'force_update',
        currentVersion,
        latestVersion,
        minimumVersion,
        updateUrl: getStoreUrl(),
        message:
          data.message ??
          'A critical update is required. Please update to continue using the app.',
      };
    }

    // Check if update available
    if (compareVersions(currentVersion, latestVersion) < 0) {
      return {
        status: 'update_available',
        currentVersion,
        latestVersion,
        minimumVersion,
        updateUrl: getStoreUrl(),
        message:
          data.message ?? 'A new version is available with improvements.',
      };
    }

    return {
      status: 'current',
      currentVersion,
      latestVersion,
      minimumVersion,
      updateUrl: getStoreUrl(),
      message: null,
    };
  } catch {
    // Network error or API not available
    return defaultResult;
  }
}
