import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_ONLY_MESSAGE_NAMESPACES,
  getPublicClientMessages,
} from './client-messages';

describe('getPublicClientMessages', () => {
  it('removes dashboard-only namespaces from public payloads', () => {
    const messages = {
      common: { save: 'Save' },
      landing: { title: 'Tuturuuu' },
      'ws-users': { title: 'Users' },
      'blue-green-monitoring': { title: 'Deployments' },
    };

    expect(getPublicClientMessages(messages)).toEqual({
      common: { save: 'Save' },
      landing: { title: 'Tuturuuu' },
    });
  });

  it('keeps the exclusion list unique', () => {
    expect(new Set(DASHBOARD_ONLY_MESSAGE_NAMESPACES).size).toBe(
      DASHBOARD_ONLY_MESSAGE_NAMESPACES.length
    );
  });
});
