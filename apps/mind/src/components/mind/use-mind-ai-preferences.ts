'use client';

import type { AIModelUI } from '@tuturuuu/types';
import { useEffect, useState } from 'react';
import {
  INITIAL_MIND_AI_MODEL,
  type MindAiThinkingMode,
} from './mind-ai-options';

export type MindAiCreditSource = 'personal' | 'workspace';

const MODEL_STORAGE_KEY_PREFIX = 'mind-ai-model-';
const THINKING_STORAGE_KEY_PREFIX = 'mind-ai-thinking-mode-';
const CREDIT_SOURCE_STORAGE_KEY_PREFIX = 'mind-ai-credit-source-';

function modelFromStorage(value: string | null): AIModelUI {
  if (!value) return INITIAL_MIND_AI_MODEL;

  try {
    const parsed = JSON.parse(value) as Partial<AIModelUI>;
    if (parsed.value && parsed.provider) {
      return {
        label:
          parsed.label ??
          parsed.value.split('/').slice(1).join('/') ??
          parsed.value,
        provider: parsed.provider,
        value: parsed.value,
      };
    }
  } catch {
    return INITIAL_MIND_AI_MODEL;
  }

  return INITIAL_MIND_AI_MODEL;
}

function thinkingModeFromStorage(value: string | null): MindAiThinkingMode {
  return value === 'thinking' ? 'thinking' : 'fast';
}

function creditSourceFromStorage(value: string | null): MindAiCreditSource {
  return value === 'personal' ? 'personal' : 'workspace';
}

export function useMindAiPreferences(wsId: string) {
  const [model, setModel] = useState<AIModelUI>(INITIAL_MIND_AI_MODEL);
  const [thinkingMode, setThinkingMode] = useState<MindAiThinkingMode>('fast');
  const [creditSource, setCreditSource] =
    useState<MindAiCreditSource>('workspace');
  const [restoredWsId, setRestoredWsId] = useState<string | null>(null);

  useEffect(() => {
    setModel(
      modelFromStorage(
        localStorage.getItem(`${MODEL_STORAGE_KEY_PREFIX}${wsId}`)
      )
    );
    setThinkingMode(
      thinkingModeFromStorage(
        localStorage.getItem(`${THINKING_STORAGE_KEY_PREFIX}${wsId}`)
      )
    );
    setCreditSource(
      creditSourceFromStorage(
        localStorage.getItem(`${CREDIT_SOURCE_STORAGE_KEY_PREFIX}${wsId}`)
      )
    );
    setRestoredWsId(wsId);
  }, [wsId]);

  useEffect(() => {
    if (restoredWsId !== wsId) return;
    localStorage.setItem(
      `${MODEL_STORAGE_KEY_PREFIX}${wsId}`,
      JSON.stringify({
        label: model.label,
        provider: model.provider,
        value: model.value,
      })
    );
  }, [model.label, model.provider, model.value, restoredWsId, wsId]);

  useEffect(() => {
    if (restoredWsId !== wsId) return;
    localStorage.setItem(`${THINKING_STORAGE_KEY_PREFIX}${wsId}`, thinkingMode);
  }, [restoredWsId, thinkingMode, wsId]);

  useEffect(() => {
    if (restoredWsId !== wsId) return;
    localStorage.setItem(
      `${CREDIT_SOURCE_STORAGE_KEY_PREFIX}${wsId}`,
      creditSource
    );
  }, [creditSource, restoredWsId, wsId]);

  return {
    creditSource,
    model,
    setCreditSource,
    setModel,
    setThinkingMode,
    thinkingMode,
  };
}
