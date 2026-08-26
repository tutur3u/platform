import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTERNAL_PROJECT_EMAIL_POLICY,
  externalProjectEmailPolicySchema,
  listDisallowedRecipientDomains,
  readExternalProjectEmailPolicy,
  writeExternalProjectEmailPolicy,
} from './email-policy';

describe('external project email policy', () => {
  it('defaults to deny when settings are absent or malformed', () => {
    expect(readExternalProjectEmailPolicy(null)).toEqual(
      DEFAULT_EXTERNAL_PROJECT_EMAIL_POLICY
    );
    expect(readExternalProjectEmailPolicy({ outboundEmail: true })).toEqual(
      DEFAULT_EXTERNAL_PROJECT_EMAIL_POLICY
    );
  });

  it('normalizes and deduplicates recipient domains', () => {
    expect(
      externalProjectEmailPolicySchema.parse({
        allowedRecipientDomains: [' Tuturuuu.com ', 'tuturuuu.com'],
        enabled: true,
        useRootWorkspaceCredentials: true,
      }).allowedRecipientDomains
    ).toEqual(['tuturuuu.com']);
  });

  it('rejects wildcards, schemes, and partial hostnames', () => {
    for (const domain of [
      '*',
      '*.example.com',
      'https://example.com',
      'local',
    ]) {
      expect(() =>
        externalProjectEmailPolicySchema.parse({
          allowedRecipientDomains: [domain],
          enabled: true,
          useRootWorkspaceCredentials: false,
        })
      ).toThrow();
    }
  });

  it('keeps unrelated binding settings while writing the policy', () => {
    const settings = writeExternalProjectEmailPolicy(
      { cmsSite: { template: { version: 1 } } },
      {
        allowedRecipientDomains: ['example.com'],
        enabled: true,
        useRootWorkspaceCredentials: false,
      }
    );

    expect(settings).toMatchObject({
      cmsSite: { template: { version: 1 } },
      outboundEmail: {
        allowedRecipientDomains: ['example.com'],
        enabled: true,
        useRootWorkspaceCredentials: false,
      },
    });
  });

  it('returns only exact recipient domains that are not allowlisted', () => {
    const policy = {
      allowedRecipientDomains: ['example.com'],
      enabled: true,
      useRootWorkspaceCredentials: false,
    };

    expect(
      listDisallowedRecipientDomains(
        ['owner@example.com', 'ops@sub.example.com', 'friend@other.com'],
        policy
      )
    ).toEqual(['sub.example.com', 'other.com']);
  });
});
