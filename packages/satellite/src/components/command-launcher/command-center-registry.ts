'use client';

import type { CommandCenterOpenOptions } from './command-launcher-types';
import {
  GLOBAL_COMMAND_LAUNCHER_EVENT,
  type GlobalCommandLauncherAction,
  type GlobalCommandLauncherEvent,
} from './events';

/**
 * Document-wide election for the command center. Every mounted launcher
 * registers here, but only the highest-priority instance (latest mount on a
 * tie) is active. The registry owns exactly one keydown listener and one
 * open/close event listener per document, so duplicate mounts never compete
 * for Ctrl/Cmd+K.
 */
export type CommandCenterInstanceHandler = (
  action: GlobalCommandLauncherAction,
  options?: CommandCenterOpenOptions
) => void;

type CommandCenterInstance = {
  handler: CommandCenterInstanceHandler;
  order: number;
  priority: number;
};

const instances = new Map<symbol, CommandCenterInstance>();
const subscribers = new Set<() => void>();
let registrationOrder = 0;
let activeId: symbol | null = null;
let preloadIntent: (() => void) | null = null;
let listenersAttached = false;

function electActive() {
  let next: { id: symbol; instance: CommandCenterInstance } | null = null;
  for (const [id, instance] of instances) {
    if (
      !next ||
      instance.priority > next.instance.priority ||
      (instance.priority === next.instance.priority &&
        instance.order > next.instance.order)
    ) {
      next = { id, instance };
    }
  }
  const nextId = next?.id ?? null;
  if (nextId === activeId) return;
  activeId = nextId;
  for (const subscriber of subscribers) subscriber();
}

export function isCommandCenterShortcut(event: KeyboardEvent) {
  return (
    !event.repeat &&
    event.key.toLowerCase() === 'k' &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

function getFocusedElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const element = document.activeElement;
  return element instanceof HTMLElement && element !== document.body
    ? element
    : null;
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.isComposing) return;
  const active = activeId ? instances.get(activeId) : undefined;
  if (!active) return;

  // A held modifier is the earliest signal of a Ctrl/Cmd+K intent; start
  // fetching the dialog chunk before K arrives.
  if (event.key === 'Meta' || event.key === 'Control') {
    preloadIntent?.();
    return;
  }

  if (!isCommandCenterShortcut(event)) return;
  event.preventDefault();
  event.stopPropagation();
  active.handler('toggle', { returnFocus: getFocusedElement() });
}

function onLauncherEvent(event: Event) {
  const active = activeId ? instances.get(activeId) : undefined;
  if (!active) return;
  const detail = (event as GlobalCommandLauncherEvent).detail;
  if (!detail?.action) return;
  const options = detail.options ?? {};
  active.handler(detail.action, {
    ...options,
    returnFocus:
      options.returnFocus === undefined
        ? getFocusedElement()
        : options.returnFocus,
  });
}

function attachListeners() {
  if (listenersAttached || typeof document === 'undefined') return;
  document.addEventListener('keydown', onDocumentKeyDown, { capture: true });
  window.addEventListener(GLOBAL_COMMAND_LAUNCHER_EVENT, onLauncherEvent);
  listenersAttached = true;
}

function detachListeners() {
  if (!listenersAttached || typeof document === 'undefined') return;
  document.removeEventListener('keydown', onDocumentKeyDown, {
    capture: true,
  });
  window.removeEventListener(GLOBAL_COMMAND_LAUNCHER_EVENT, onLauncherEvent);
  listenersAttached = false;
}

export function registerCommandCenterInstance(
  id: symbol,
  priority: number,
  handler: CommandCenterInstanceHandler
) {
  registrationOrder += 1;
  instances.set(id, { handler, order: registrationOrder, priority });
  attachListeners();
  electActive();
}

export function unregisterCommandCenterInstance(id: symbol) {
  instances.delete(id);
  if (instances.size === 0) detachListeners();
  electActive();
}

export function subscribeCommandCenterRegistry(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function getActiveCommandCenterId() {
  return activeId;
}

/** Registers the chunk preloader used for the earliest keyboard intent. */
export function setCommandCenterPreloader(preload: () => void) {
  preloadIntent = preload;
}

export function clearCommandCenterPreloader(preload: () => void) {
  if (preloadIntent === preload) preloadIntent = null;
}

/** Number of document listeners currently attached; one per kind at most. */
export function getCommandCenterListenerCount() {
  return listenersAttached ? 1 : 0;
}
