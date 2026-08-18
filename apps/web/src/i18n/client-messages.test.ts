import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import {
  getPublicClientMessages,
  PUBLIC_CLIENT_MESSAGE_NAMESPACES,
} from './client-messages';

describe('getPublicClientMessages', () => {
  it('keeps only explicitly client-visible namespaces', () => {
    const messages = {
      common: { save: 'Save' },
      landing: { title: 'Tuturuuu' },
      'ws-users': { title: 'Users' },
    };

    expect(getPublicClientMessages(messages)).toEqual({
      common: { save: 'Save' },
      landing: { title: 'Tuturuuu' },
    });
  });

  it('keeps the allowlist unique and available in every locale', () => {
    expect(new Set(PUBLIC_CLIENT_MESSAGE_NAMESPACES).size).toBe(
      PUBLIC_CLIENT_MESSAGE_NAMESPACES.length
    );

    for (const namespace of PUBLIC_CLIENT_MESSAGE_NAMESPACES) {
      expect(en).toHaveProperty(namespace);
      expect(vi).toHaveProperty(namespace);
    }
  });

  it('keeps public serialization below one third of the full catalog', () => {
    for (const messages of [en, vi]) {
      const fullBytes = JSON.stringify(messages).length;
      const publicBytes = JSON.stringify(
        getPublicClientMessages(messages)
      ).length;

      expect(publicBytes / fullBytes).toBeLessThan(1 / 3);
    }
  });
});
