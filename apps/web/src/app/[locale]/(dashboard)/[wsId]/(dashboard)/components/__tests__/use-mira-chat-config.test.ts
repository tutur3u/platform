import { describe, expect, it } from 'vitest';
import {
  getEffectiveMiraWorkspaceContextId,
  resolveAvailableMiraModel,
} from '../use-mira-chat-config';

describe('getEffectiveMiraWorkspaceContextId', () => {
  it('uses the current task-board workspace context when available', () => {
    expect(
      getEffectiveMiraWorkspaceContextId({
        taskBoardContext: {
          workspaceId: '00000000-0000-0000-0000-000000000000',
        },
        workspaceContextId: 'personal',
      })
    ).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('falls back to the selected Mira workspace context outside task boards', () => {
    expect(
      getEffectiveMiraWorkspaceContextId({
        workspaceContextId: 'internal',
      })
    ).toBe('00000000-0000-0000-0000-000000000000');
  });
});

describe('resolveAvailableMiraModel', () => {
  const enabledModels = [
    {
      label: 'Gemini 3.1 Flash-Lite',
      provider: 'google',
      value: 'google/gemini-3.1-flash-lite',
    },
    {
      label: 'Gemini 3.5 Flash',
      provider: 'google',
      value: 'google/gemini-3.5-flash',
    },
  ];

  it('falls back to the plan default when a persisted selection is disabled', () => {
    expect(
      resolveAvailableMiraModel({
        allowedModels: [
          'google/gemini-3.1-flash-lite',
          'google/gemini-3.5-flash',
        ],
        defaultLanguageModelId: 'google/gemini-3.1-flash-lite',
        gatewayModels: enabledModels,
        selectedModel: {
          disabled: true,
          label: 'Retired model',
          provider: 'google',
          value: 'google/retired-model',
        },
      }).value
    ).toBe('google/gemini-3.1-flash-lite');
  });
});
