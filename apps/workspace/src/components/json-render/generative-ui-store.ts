import type { StateModel, StateStore } from '@json-render/core';
import { createStoreAdapter } from '@json-render/core/store-utils';
import { create } from 'zustand';

interface GenerativeUIState {
  /** Flat state map used by json-render components (JSON Pointer paths) */
  ui: StateModel;
}

/** Zustand store for generative UI state */
export const useGenerativeUIStore = create<GenerativeUIState>(() => ({
  ui: {},
}));

/** Build a json-render StateStore backed by the Zustand store */
export function createGenerativeUIAdapter(): StateStore {
  return createStoreAdapter({
    getSnapshot: () => useGenerativeUIStore.getState().ui,
    setSnapshot: (next) => useGenerativeUIStore.setState({ ui: next }),
    subscribe: (listener) => useGenerativeUIStore.subscribe(listener),
  });
}

/** Reset the store (used when starting a new conversation) */
export function resetGenerativeUIStore() {
  useGenerativeUIStore.setState({ ui: {} });
}
