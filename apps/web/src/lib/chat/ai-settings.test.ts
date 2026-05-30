import { describe, expect, it } from 'vitest';
import {
  buildFullChatAiSettingsUpdatePayload,
  buildLegacyChatAiSettingsUpdatePayload,
  hasNewChatAiSettingsPatchFields,
  isChatAiSettingsSchemaCacheError,
  mapChatAiSettingsRow,
  mapNativeChatAiSettingsRow,
  normalizeAiModelId,
  serializeChatAiSettingsDbError,
} from './ai-settings';

describe('chat AI settings helpers', () => {
  it('detects undefined-column and stale schema-cache errors', () => {
    expect(
      isChatAiSettingsSchemaCacheError({
        code: '42703',
        message: 'column "thinking_mode" does not exist',
      })
    ).toBe(true);
    expect(
      isChatAiSettingsSchemaCacheError({
        code: 'PGRST204',
        message:
          "Could not find the 'thinking_mode' column of 'chat_conversation_ai_settings' in the schema cache",
      })
    ).toBe(true);
    expect(
      isChatAiSettingsSchemaCacheError({
        code: '23514',
        message: 'check constraint failed',
      })
    ).toBe(false);
  });

  it('serializes database errors without leaking unknown shapes', () => {
    expect(
      serializeChatAiSettingsDbError({
        code: '42703',
        details: 'missing column',
        hint: 'reload schema',
        message: 'column missing',
      })
    ).toEqual({
      code: '42703',
      details: 'missing column',
      hint: 'reload schema',
      message: 'column missing',
    });
  });

  it('maps legacy rows to stable defaults', () => {
    expect(
      mapChatAiSettingsRow({
        conversationId: 'conversation-1',
        personalWorkspaceId: 'personal-1',
        row: {
          auto_reply: false,
          enabled: false,
          model_id: 'gemini-3-flash',
          system_prompt: 'Be concise',
          updated_at: '2026-05-29T00:00:00.000Z',
        },
      })
    ).toEqual({
      autoReply: false,
      conversationId: 'conversation-1',
      creditSource: 'workspace',
      creditWsId: null,
      enabled: false,
      modelId: 'google/gemini-3.1-flash-lite',
      personalWorkspaceId: 'personal-1',
      systemPrompt: 'Be concise',
      thinkingMode: 'fast',
      updatedAt: '2026-05-29T00:00:00.000Z',
    });

    expect(
      mapNativeChatAiSettingsRow({
        model_id: 'google/gemini-3-pro',
        system_prompt: 'Use examples',
      })
    ).toEqual({
      credit_source: 'workspace',
      credit_ws_id: null,
      model_id: 'google/gemini-3-pro',
      system_prompt: 'Use examples',
      thinking_mode: 'fast',
    });
  });

  it('separates full and legacy update payloads', () => {
    const patch = {
      creditSource: 'personal' as const,
      creditWsId: '00000000-0000-4000-8000-000000000001',
      modelId: 'google/gemini-3.1-flash-lite',
      systemPrompt: null,
      thinkingMode: 'thinking' as const,
    };

    expect(buildFullChatAiSettingsUpdatePayload(patch)).toEqual({
      credit_source: 'personal',
      credit_ws_id: '00000000-0000-4000-8000-000000000001',
      model_id: 'google/gemini-3.1-flash-lite',
      system_prompt: null,
      thinking_mode: 'thinking',
    });
    expect(buildLegacyChatAiSettingsUpdatePayload(patch)).toEqual({
      model_id: 'google/gemini-3.1-flash-lite',
      system_prompt: null,
    });
    expect(hasNewChatAiSettingsPatchFields(patch)).toBe(true);
    expect(hasNewChatAiSettingsPatchFields({ modelId: 'x' })).toBe(false);
  });

  it('normalizes bare Google model IDs', () => {
    expect(normalizeAiModelId('gemini-3-flash')).toBe(
      'google/gemini-3.1-flash-lite'
    );
    expect(normalizeAiModelId('openai/gpt-5')).toBe('openai/gpt-5');
    expect(normalizeAiModelId(null)).toBe('google/gemini-3.1-flash-lite');
  });
});
