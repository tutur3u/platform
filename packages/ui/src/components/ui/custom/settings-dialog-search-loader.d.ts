import type { createSettingsSearchEngine } from './settings-dialog-search';

export function loadSettingsSearchEngine(): Promise<{
  createSettingsSearchEngine: typeof createSettingsSearchEngine;
}>;
