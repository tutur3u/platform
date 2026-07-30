import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stagePlaygroundSecret,
  takePlaygroundSecret,
} from './playground-secret-transfer';

describe('AI Studio playground secret transfer', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it('scopes the secret to a workspace and consumes it only once', () => {
    stagePlaygroundSecret('workspace-1', 'ttr_ai_one_time');

    expect(takePlaygroundSecret('workspace-2')).toBe('');
    expect(takePlaygroundSecret('workspace-1')).toBe('ttr_ai_one_time');
    expect(takePlaygroundSecret('workspace-1')).toBe('');
  });
});
