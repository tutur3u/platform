import { describe, expect, it } from 'vitest';
import { extractSelectedToolsFromSteps } from '../chat/mira-render-ui-policy';
import { searchMiraTools } from './mira-tool-discovery';

describe('Mira tool discovery', () => {
  it('finds and activates an exact operation without the full catalog', () => {
    const result = searchMiraTools({ query: 'create_task', limit: 1 });
    expect(result.selectedTools).toEqual(['create_task']);
    expect(
      extractSelectedToolsFromSteps([
        { toolResults: [{ toolName: 'search_tools', output: result }] },
      ])
    ).toEqual(['create_task']);
  });
  it('omits operations outside the authorized set', () => {
    expect(
      searchMiraTools({ query: 'create task' }, new Set(['list_boards']))
        .selectedTools
    ).toEqual(['list_boards']);
    expect(
      searchMiraTools({ query: 'create task' }, new Set()).selectedTools
    ).toEqual([]);
  });
  it('bounds discovery and includes domain guidance on demand', () => {
    const result = searchMiraTools({ query: 'task priority', limit: 100 });
    expect(result.matches.length).toBeLessThanOrEqual(8);
    expect(result.guidance.some(({ domain }) => domain === 'tasks')).toBe(true);
    expect(searchMiraTools({ query: 'zzzzzzzzz' }).selectedTools).toEqual([]);
  });
});
