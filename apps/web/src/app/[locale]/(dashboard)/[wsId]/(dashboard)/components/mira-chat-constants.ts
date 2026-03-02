import type { AIModelUI } from '@tuturuuu/types';

export type { CreditSource } from '@tuturuuu/ai/chat/credit-source';

export const INITIAL_MODEL: AIModelUI = {
  value: 'google/gemini-3-flash',
  label: 'gemini-3-flash',
  provider: 'google',
};
export const STORAGE_KEY_PREFIX = 'mira-dashboard-chat-';
export const MODEL_STORAGE_KEY_PREFIX = 'mira-dashboard-model-';
export const THINKING_MODE_STORAGE_KEY_PREFIX = 'mira-dashboard-thinking-mode-';
export const CREDIT_SOURCE_STORAGE_KEY_PREFIX = 'mira-dashboard-credit-source-';
export const WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX =
  'mira-dashboard-workspace-context-';
export const WORKSPACE_CONTEXT_EVENT =
  'mira-dashboard-workspace-context-change';
export const HOTKEY_NEW_CHAT = 'Alt+Shift+N';
export const HOTKEY_MODEL_PICKER = 'Alt+Shift+M';
export const HOTKEY_FULLSCREEN = 'Mod+Alt+F';
export const HOTKEY_FAST_MODE = 'Mod+Alt+[';
export const HOTKEY_THINKING_MODE = 'Mod+Alt+]';
export const HOTKEY_VIEW_ONLY = 'Mod+Alt+V';
export const HOTKEY_CREDIT_SOURCE = 'Mod+Alt+S';
export const HOTKEY_EXPORT = 'Mod+Alt+E';
export const QUEUE_DEBOUNCE_MS = 500;
export const SCROLL_END_DELAY_MS = 700;

export type ThinkingMode = 'fast' | 'thinking';

export type GreetingKey =
  | 'good_morning'
  | 'good_afternoon'
  | 'good_evening'
  | 'good_night';

export const emptyStateActions = [
  {
    titleKey: 'quick_calendar',
    descKey: 'quick_calendar_desc',
  },
  { titleKey: 'quick_tasks', descKey: 'quick_tasks_desc' },
  { titleKey: 'quick_focus', descKey: 'quick_focus_desc' },
  { titleKey: 'quick_log', descKey: 'quick_log_desc' },
] as const;

export function getGreetingKey(): GreetingKey {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'good_morning';
  if (hour >= 12 && hour < 17) return 'good_afternoon';
  if (hour >= 17 && hour < 24) return 'good_evening';
  return 'good_night';
}
