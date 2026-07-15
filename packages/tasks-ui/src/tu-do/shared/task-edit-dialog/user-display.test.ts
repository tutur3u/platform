import { describe, expect, it } from 'vitest';
import {
  getTaskDialogUserDisplayName,
  normalizeTaskDialogCurrentUser,
} from './user-display';

describe('task dialog user display helpers', () => {
  it('prefers display_name for collaboration cursor labels', () => {
    expect(
      getTaskDialogUserDisplayName({
        id: 'user-1',
        display_name: 'Display Name',
        full_name: 'Full Name',
        email: 'email@example.com',
      })
    ).toBe('Display Name');
  });

  it('falls back to full_name before email local-part', () => {
    expect(
      getTaskDialogUserDisplayName({
        id: 'user-1',
        display_name: '',
        full_name: 'Full Name',
        email: 'email@example.com',
      })
    ).toBe('Full Name');
  });

  it('uses email local-part before the anonymous fallback', () => {
    expect(
      getTaskDialogUserDisplayName({
        id: 'user-1',
        display_name: null,
        full_name: null,
        email: 'email@example.com',
      })
    ).toBe('email');
  });

  it('normalizes current user props without dropping full_name', () => {
    expect(
      normalizeTaskDialogCurrentUser({
        id: 'user-1',
        display_name: null,
        full_name: 'Full Name',
        email: 'email@example.com',
        avatar_url: undefined,
      })
    ).toEqual({
      id: 'user-1',
      display_name: null,
      full_name: 'Full Name',
      email: 'email@example.com',
      avatar_url: null,
    });
  });
});
