import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';
import { describe, expect, it } from 'vitest';
import { KNOWN_SECRETS } from './constants';
import {
  getSecretNameOptions,
  normalizeCustomSecretName,
} from './secret-name-options';

describe('workspace secret name options', () => {
  it('includes the topic announcements feature flag as a known boolean secret', () => {
    expect(KNOWN_SECRETS).toContainEqual(
      expect.objectContaining({
        defaultValue: 'false',
        name: TOPIC_ANNOUNCEMENTS_SECRET,
        type: 'boolean',
      })
    );
  });

  it('keeps a custom selected name visible even when it is not predefined', () => {
    expect(
      getSecretNameOptions({
        availableSecrets: [
          {
            description: 'Known secret',
            name: 'ENABLE_USERS',
            type: 'boolean',
          },
        ],
        currentName: undefined,
        existingSecrets: [],
        selectedName: 'CUSTOM_SECRET',
      })
    ).toEqual([
      { label: 'CUSTOM_SECRET', value: 'CUSTOM_SECRET' },
      { label: 'ENABLE_USERS', value: 'ENABLE_USERS' },
    ]);
  });

  it('does not re-add a selected name that already exists on another secret', () => {
    expect(
      getSecretNameOptions({
        availableSecrets: [],
        currentName: undefined,
        existingSecrets: ['CUSTOM_SECRET'],
        selectedName: 'CUSTOM_SECRET',
      })
    ).toEqual([]);
  });

  it('normalizes created custom names into environment-style secret names', () => {
    expect(normalizeCustomSecretName(' recent topic announcements ')).toBe(
      'RECENT_TOPIC_ANNOUNCEMENTS'
    );
  });
});
