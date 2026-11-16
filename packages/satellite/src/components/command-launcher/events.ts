'use client';

import type { CommandCenterOpenOptions } from './command-launcher-types';

export const GLOBAL_COMMAND_LAUNCHER_EVENT = 'tuturuuu:command-launcher';

export type GlobalCommandLauncherAction = 'close' | 'open' | 'toggle';

export type GlobalCommandLauncherEvent = CustomEvent<{
  action: GlobalCommandLauncherAction;
  options?: CommandCenterOpenOptions;
}>;

function dispatchCommandLauncherAction(
  action: GlobalCommandLauncherAction,
  options?: CommandCenterOpenOptions
) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(GLOBAL_COMMAND_LAUNCHER_EVENT, {
      detail: { action, options },
    })
  );
}

/**
 * Opens the document's command center. Options choose the starting scope,
 * query and mode; `returnFocus` names the element focused again on close.
 */
export function openGlobalCommandLauncher(options?: CommandCenterOpenOptions) {
  dispatchCommandLauncherAction('open', options);
}

export function closeGlobalCommandLauncher() {
  dispatchCommandLauncherAction('close');
}

export function toggleGlobalCommandLauncher(
  options?: CommandCenterOpenOptions
) {
  dispatchCommandLauncherAction('toggle', options);
}
