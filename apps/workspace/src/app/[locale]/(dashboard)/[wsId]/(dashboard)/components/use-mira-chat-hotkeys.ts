'use client';

import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys';
import { useMemo, useState } from 'react';
import {
  HOTKEY_CREDIT_SOURCE,
  HOTKEY_EXPORT,
  HOTKEY_FAST_MODE,
  HOTKEY_FULLSCREEN,
  HOTKEY_MODEL_PICKER,
  HOTKEY_NEW_CHAT,
  HOTKEY_THINKING_MODE,
  HOTKEY_VIEW_ONLY,
  type ThinkingMode,
} from './mira-chat-constants';

interface UseMiraChatHotkeysParams {
  hasMessages: boolean;
  onCreditSourceToggle?: () => void;
  onExportChat: () => void;
  onNewConversation: () => void;
  onThinkingModeChange: (mode: ThinkingMode) => void;
  onToggleFullscreen?: () => void;
  onToggleViewOnly: () => void;
}

export function useMiraChatHotkeys({
  hasMessages,
  onCreditSourceToggle,
  onExportChat,
  onNewConversation,
  onThinkingModeChange,
  onToggleFullscreen,
  onToggleViewOnly,
}: UseMiraChatHotkeysParams) {
  const [modelPickerHotkeySignal, setModelPickerHotkeySignal] = useState(0);

  const hotkeyLabels = useMemo(
    () => ({
      creditSource: formatForDisplay(HOTKEY_CREDIT_SOURCE),
      export: formatForDisplay(HOTKEY_EXPORT),
      fastMode: formatForDisplay(HOTKEY_FAST_MODE),
      fullscreen: formatForDisplay(HOTKEY_FULLSCREEN),
      modelPicker: formatForDisplay(HOTKEY_MODEL_PICKER),
      newChat: formatForDisplay(HOTKEY_NEW_CHAT),
      thinkingMode: formatForDisplay(HOTKEY_THINKING_MODE),
      viewOnly: formatForDisplay(HOTKEY_VIEW_ONLY),
    }),
    []
  );

  useHotkey(HOTKEY_NEW_CHAT, onNewConversation, {
    preventDefault: true,
  });

  useHotkey(
    HOTKEY_MODEL_PICKER,
    () => {
      setModelPickerHotkeySignal((value) => value + 1);
    },
    { preventDefault: true }
  );

  useHotkey(HOTKEY_FAST_MODE, () => onThinkingModeChange('fast'), {
    preventDefault: true,
  });

  useHotkey(HOTKEY_THINKING_MODE, () => onThinkingModeChange('thinking'), {
    preventDefault: true,
  });

  useHotkey(
    HOTKEY_FULLSCREEN,
    () => {
      onToggleFullscreen?.();
    },
    {
      enabled: Boolean(onToggleFullscreen),
      preventDefault: true,
    }
  );

  useHotkey(
    HOTKEY_VIEW_ONLY,
    () => {
      if (!hasMessages) return;
      onToggleViewOnly();
    },
    {
      enabled: hasMessages,
      preventDefault: true,
    }
  );

  useHotkey(
    HOTKEY_EXPORT,
    () => {
      if (!hasMessages) return;
      onExportChat();
    },
    {
      enabled: hasMessages,
      preventDefault: true,
    }
  );

  useHotkey(
    HOTKEY_CREDIT_SOURCE,
    () => {
      onCreditSourceToggle?.();
    },
    {
      enabled: Boolean(onCreditSourceToggle),
      preventDefault: true,
    }
  );

  return {
    hotkeyLabels,
    modelPickerHotkeySignal,
  };
}
