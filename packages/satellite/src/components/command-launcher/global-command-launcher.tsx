'use client';

import { usePathname } from 'next/navigation';
import { CommandCenterHost } from './command-center-host';
import type { GlobalCommandLauncherProps } from './command-launcher-types';

export type {
  CommandLauncherExtraSectionContext,
  CommandLauncherNavItem,
  GlobalCommandLauncherLabels,
  GlobalCommandLauncherProps,
  LauncherWorkspace,
} from './command-launcher-types';

/**
 * Next.js adapter for the shared command center: supplies the router
 * pathname. Framework-free hosts use `CommandCenterHost` from
 * `@tuturuuu/satellite/command-center`.
 */
export function GlobalCommandLauncher(props: GlobalCommandLauncherProps) {
  const pathname = usePathname();
  return <CommandCenterHost {...props} pathname={pathname} />;
}
