import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stagePlaygroundSecret,
  takePlaygroundSecret,
} from './playground-secret-transfer';

describe('AI Studio playground secret transfer', () => {
  const setItem = vi.fn();

  beforeEach(() => {
    setItem.mockClear();
    for (const name of ['sessionStorage', 'localStorage']) {
      vi.stubGlobal(name, {
        getItem: vi.fn(() => null),
        removeItem: vi.fn(),
        setItem,
      });
    }
  });

  afterEach(() => {
    takePlaygroundSecret('workspace-1');
    takePlaygroundSecret('workspace-2');
    vi.unstubAllGlobals();
  });

  it('scopes the secret to a workspace and consumes it only once', () => {
    stagePlaygroundSecret('workspace-1', 'ttr_ai_one_time');

    expect(takePlaygroundSecret('workspace-2')).toBe('');
    expect(takePlaygroundSecret('workspace-1')).toBe('ttr_ai_one_time');
    expect(takePlaygroundSecret('workspace-1')).toBe('');
  });

  it('never writes the secret to web storage', () => {
    stagePlaygroundSecret('workspace-1', 'ttr_ai_one_time');

    expect(setItem).not.toHaveBeenCalled();
    expect(takePlaygroundSecret('workspace-1')).toBe('ttr_ai_one_time');
  });

  it('keeps only the most recently staged secret', () => {
    stagePlaygroundSecret('workspace-1', 'ttr_ai_first');
    stagePlaygroundSecret('workspace-2', 'ttr_ai_second');

    expect(takePlaygroundSecret('workspace-1')).toBe('');
    expect(takePlaygroundSecret('workspace-2')).toBe('ttr_ai_second');
  });
});
