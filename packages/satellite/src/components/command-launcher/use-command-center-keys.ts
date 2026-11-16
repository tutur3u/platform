'use client';

import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';
import { resolveCommandCenterKey } from './command-center-keyboard';
import type { CommandLauncherTab } from './command-launcher-tabs';
import type { CommandItemEntry } from './use-command-center-navigation';

/** Binds the pure key grammar to session state for the search input. */
export function useCommandCenterKeys({
  actionEntry,
  actionIndex,
  activeTab,
  availableTabs,
  changeTab,
  defaultTab,
  query,
  routedTab,
  selectedEntry,
  selectedValue,
  setActionIndex,
  setActionsFor,
}: {
  actionEntry: CommandItemEntry | undefined;
  actionIndex: number;
  activeTab: CommandLauncherTab;
  availableTabs: readonly CommandLauncherTab[];
  changeTab: (tab: CommandLauncherTab) => void;
  defaultTab: CommandLauncherTab;
  query: string;
  routedTab: CommandLauncherTab;
  selectedEntry: CommandItemEntry | undefined;
  selectedValue: string;
  setActionIndex: Dispatch<SetStateAction<number>>;
  setActionsFor: Dispatch<SetStateAction<string | null>>;
}) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const intent = resolveCommandCenterKey(
      {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      },
      {
        actionsOpen: Boolean(actionEntry),
        activeTab,
        availableTabs,
        caretAtEnd:
          input.selectionStart === input.value.length &&
          input.selectionEnd === input.value.length,
        defaultTab,
        hasSelectedActions: Boolean(selectedEntry?.actions.length),
        hasSelectedEntry: Boolean(selectedEntry),
        query,
        routedTab,
      }
    );
    if (intent.type === 'none') return;
    // cmdk skips its own handling for default-prevented key events.
    event.preventDefault();
    const actions = actionEntry?.actions ?? [];
    switch (intent.type) {
      case 'scope':
        changeTab(intent.tab);
        return;
      case 'open-new-tab':
        selectedEntry?.open({ newTab: true });
        return;
      case 'actions-open':
        setActionsFor(selectedValue);
        setActionIndex(0);
        return;
      case 'actions-move':
        if (actions.length === 0) return;
        setActionIndex(
          (index) => (index + intent.delta + actions.length) % actions.length
        );
        return;
      case 'actions-run':
        actions[actionIndex]?.run();
        return;
      case 'actions-close':
        setActionsFor(null);
    }
  };
}
