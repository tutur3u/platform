import { describe, expect, it } from 'vitest';
import {
  externalChatSettingsSchema,
  isExternalChatLiveAuthority,
} from './schemas';

describe('external chat settings', () => {
  it('rejects malformed or non-origin bridge URLs without throwing', () => {
    expect(
      externalChatSettingsSchema.safeParse({
        agentMappings: {},
        authorityMode: 'legacy_primary',
        bridgeBaseUrl: 'not a URL',
        enabled: true,
        inboxDefaults: {},
      }).success
    ).toBe(false);
  });

  it('fails closed for malformed persisted authority modes', () => {
    const settings = {
      chat: {
        agentMappings: {},
        authorityMode: 'unexpected_live_mode',
        bridgeBaseUrl: 'https://bridge.example.com',
        enabled: true,
        inboxDefaults: {},
      },
    };
    expect(isExternalChatLiveAuthority(settings)).toBe(false);
  });

  it('accepts only a credential-free HTTPS origin for an optional replica', () => {
    const settings = {
      agentMappings: {},
      authorityMode: 'legacy_primary',
      bridgeBaseUrl: 'https://bridge.example.com',
      enabled: true,
      inboxDefaults: {},
    } as const;
    expect(
      externalChatSettingsSchema.safeParse({
        ...settings,
        replicaBaseUrl: 'https://chat.example.com',
      }).success
    ).toBe(true);
    expect(
      externalChatSettingsSchema.safeParse({
        ...settings,
        replicaBaseUrl: 'https://chat.example.com/private',
      }).success
    ).toBe(false);
    expect(
      externalChatSettingsSchema.safeParse({
        ...settings,
        replicaBaseUrl: 'http://chat.example.com',
      }).success
    ).toBe(false);
  });

  it('validates the fallback recipient while preserving dynamic inbox data', () => {
    const parsed = externalChatSettingsSchema.safeParse({
      agentMappings: {},
      authorityMode: 'legacy_primary',
      bridgeBaseUrl: 'https://bridge.example.com',
      enabled: true,
      inboxDefaults: {
        queue: 'migration-canary',
        recipientUserId: '5f42ae0f-f447-4619-bab6-1d98496ab5ef',
      },
    });

    expect(parsed.success && parsed.data.inboxDefaults).toMatchObject({
      queue: 'migration-canary',
      recipientUserId: '5f42ae0f-f447-4619-bab6-1d98496ab5ef',
    });
    expect(
      externalChatSettingsSchema.safeParse({
        agentMappings: {},
        authorityMode: 'legacy_primary',
        bridgeBaseUrl: 'https://bridge.example.com',
        enabled: true,
        inboxDefaults: { recipientUserId: 'not-a-uuid' },
      }).success
    ).toBe(false);
  });
});
