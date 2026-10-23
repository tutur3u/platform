import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stagePlaygroundSecret,
  takePlaygroundSecret,
} from './playground-secret-transfer';

describe('AI Studio playground secret transfer', () => {
  let values: Map<string, string>;
  const setItem = vi.fn();

  beforeEach(() => {
    values = new Map<string, string>();
    setItem.mockReset();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('scopes the secret to a workspace and consumes it only once', () => {
    stagePlaygroundSecret('workspace-1', 'ttr_ai_one_time');

    expect(takePlaygroundSecret('workspace-2')).toBe('');
    expect(takePlaygroundSecret('workspace-1')).toBe('ttr_ai_one_time');
    expect(takePlaygroundSecret('workspace-1')).toBe('');
  });

  it('never writes the secret to Web Storage and purges legacy entries', () => {
    values.set('tuturuuu.ai-studio.playground-key.workspace-1', 'old');
    stagePlaygroundSecret('workspace-1', 'ttr_ai_one_time');

    expect(setItem).not.toHaveBeenCalled();
    expect(takePlaygroundSecret('workspace-1')).toBe('ttr_ai_one_time');
    expect(values.size).toBe(0);
  });

  it('drops a staged secret that is not picked up promptly', () => {
    vi.useFakeTimers();
    stagePlaygroundSecret('workspace-1', 'ttr_ai_one_time');
    vi.advanceTimersByTime(60_001);

    expect(takePlaygroundSecret('workspace-1')).toBe('');
  });
});
