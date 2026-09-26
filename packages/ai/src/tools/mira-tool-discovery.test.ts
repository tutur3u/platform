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
  it('discovers task creation and its board/list prerequisites together', () => {
    const tools = searchMiraTools({
      query: 'help me add new tasks',
    }).selectedTools;
    expect(tools).toContain('create_task');
    expect(tools).toContain('list_boards');
    expect(tools).toContain('list_task_lists');
  });
});

it('finds singular calendar operations from plural queries', () => {
  expect(
    searchMiraTools(
      { query: 'calendars' },
      new Set(['get_calendar_connections'])
    ).selectedTools
  ).toContain('get_calendar_connections');
});
it('prefers explicit selection over discovery results in the same step', () => {
  expect(
    extractSelectedToolsFromSteps([
      {
        toolResults: [
          {
            toolName: 'search_tools',
            output: { selectedTools: ['get_my_tasks'] },
          },
          {
            toolName: 'select_tools',
            output: { selectedTools: ['create_task'] },
          },
        ],
      },
    ])
  ).toEqual(['create_task']);
});

it('does not truncate singular words ending in s', () => {
  expect(searchMiraTools({ query: 'basis' }).selectedTools).toEqual([]);
  expect(searchMiraTools({ query: 'bias' }).selectedTools).toEqual([]);
});

it('activates native SDK search results and ignores malformed entries', () => {
  expect(
    extractSelectedToolsFromSteps([
      {
        toolResults: [
          {
            toolName: 'search_tools',
            output: {
              tools: [
                { name: 'create_event', description: 'Create an event' },
                null,
                { name: 123 },
              ],
            },
          },
        ],
      },
    ])
  ).toEqual(['create_event']);
});
