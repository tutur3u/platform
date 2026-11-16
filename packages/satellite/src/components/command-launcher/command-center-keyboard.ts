import { type CommandLauncherTab, cycleLauncherTab } from './command-launcher-tabs';

export type CommandCenterKeyInput = {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export type CommandCenterKeyState = {
  actionsOpen: boolean;
  activeTab: CommandLauncherTab;
  availableTabs: readonly CommandLauncherTab[];
  caretAtEnd: boolean;
  defaultTab: CommandLauncherTab;
  hasSelectedActions: boolean;
  hasSelectedEntry: boolean;
  query: string;
  routedTab: CommandLauncherTab;
};

export type CommandCenterKeyIntent =
  | { type: 'actions-close' }
  | { delta: 1 | -1; type: 'actions-move' }
  | { type: 'actions-open' }
  | { type: 'actions-run' }
  | { type: 'none' }
  | { type: 'open-new-tab' }
  | { tab: CommandLauncherTab; type: 'scope' };

const NONE: CommandCenterKeyIntent = { type: 'none' };

/**
 * Keyboard grammar of the command center input, kept pure so every binding
 * is covered without rendering. Unhandled keys fall through to cmdk (arrows,
 * Enter, Home/End) or the input (typing).
 */
export function resolveCommandCenterKey(
  event: CommandCenterKeyInput,
  state: CommandCenterKeyState
): CommandCenterKeyIntent {
  if (event.isComposing) return NONE;
  const mod = event.metaKey || event.ctrlKey;

  if (state.actionsOpen) {
    if (event.key === 'ArrowDown') return { delta: 1, type: 'actions-move' };
    if (event.key === 'ArrowUp') return { delta: -1, type: 'actions-move' };
    if (event.key === 'Enter') return { type: 'actions-run' };
    if (event.key === 'ArrowLeft') return { type: 'actions-close' };
    return NONE;
  }

  if (mod && !event.altKey && /^[1-9]$/u.test(event.key)) {
    const tab = state.availableTabs[Number(event.key) - 1];
    return tab ? { tab, type: 'scope' } : NONE;
  }

  if (event.key === 'Enter' && mod && state.hasSelectedEntry) {
    return { type: 'open-new-tab' };
  }

  if (
    event.key === 'ArrowRight' &&
    !mod &&
    !event.shiftKey &&
    state.caretAtEnd &&
    state.hasSelectedActions
  ) {
    return { type: 'actions-open' };
  }

  if (
    event.key === 'Tab' &&
    !mod &&
    !event.altKey &&
    state.availableTabs.length > 1
  ) {
    return {
      tab: cycleLauncherTab(
        state.availableTabs,
        state.routedTab,
        event.shiftKey ? -1 : 1
      ),
      type: 'scope',
    };
  }

  if (
    event.key === 'Backspace' &&
    !mod &&
    state.query === '' &&
    state.activeTab !== state.defaultTab
  ) {
    return { tab: state.defaultTab, type: 'scope' };
  }

  return NONE;
}
