import {
  buildCommandLauncherLabels,
  CommandCenterHost,
} from '@tuturuuu/satellite/command-center';
import { useMemo } from 'react';
import { useLauncherCopy } from './i18n';

/**
 * Colab's shared command center. Colab is a Vite app without Next.js, so it
 * mounts the framework-free host with labels from its own `command_launcher`
 * copy. Workspace search runs only for a known actor; Colab has none, so the
 * center offers apps and makes no workspace requests.
 */
export function ColabCommandCenter() {
  const launcherCopy = useLauncherCopy();
  const labels = useMemo(
    () => buildCommandLauncherLabels({ launcher: launcherCopy }),
    [launcherCopy]
  );
  return <CommandCenterHost currentApp="colab" labels={labels} />;
}
