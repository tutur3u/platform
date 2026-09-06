import { describe, expect, it } from 'vitest';
import { appTokenTargetMatchesExternalProjectBinding as matches } from './app-binding';

describe('external app template identity', () => {
  it('matches a custom app only to its exact template key', () => {
    const binding = {
      canonical_project: { id: 'rennu', adapter: 'custom' as const },
    };
    expect(matches({ binding, targetApp: 'rennu' })).toBe(true);
    for (const targetApp of ['custom', 'other-site', 'RENNU', '']) {
      expect(matches({ binding, targetApp })).toBe(false);
    }
  });
  it('retains built-in adapter identity without accepting its template key', () => {
    const binding = {
      canonical_project: { id: 'yashie-main', adapter: 'yashie' as const },
    };
    expect(matches({ binding, targetApp: 'yashie' })).toBe(true);
    expect(matches({ binding, targetApp: 'yashie-main' })).toBe(false);
    expect(matches({ binding, targetApp: 'rennu' })).toBe(false);
  });
  it('rejects missing bindings', () => {
    expect(
      matches({ binding: { canonical_project: null }, targetApp: 'rennu' })
    ).toBe(false);
  });
});
