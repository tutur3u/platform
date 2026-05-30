'use client';

export const GLOBAL_COMMAND_LAUNCHER_EVENT = 'tuturuuu:command-launcher';

export type GlobalCommandLauncherAction = 'close' | 'open' | 'toggle';

export type GlobalCommandLauncherEvent = CustomEvent<{
  action: GlobalCommandLauncherAction;
}>;

function dispatchCommandLauncherAction(action: GlobalCommandLauncherAction) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(GLOBAL_COMMAND_LAUNCHER_EVENT, {
      detail: { action },
    })
  );
}

export function openGlobalCommandLauncher() {
  dispatchCommandLauncherAction('open');
}

export function closeGlobalCommandLauncher() {
  dispatchCommandLauncherAction('close');
}

export function toggleGlobalCommandLauncher() {
  dispatchCommandLauncherAction('toggle');
}
