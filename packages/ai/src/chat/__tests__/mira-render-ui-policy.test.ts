import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  buildActiveToolsFromSelected,
  extractSelectedToolsFromSteps,
  hasRenderableRenderUiInSteps,
  hasToolCallInSteps,
  shouldForceGoogleSearchForLatestUserMessage,
  shouldForceRenderUiForLatestUserMessage,
  shouldForceWorkspaceMembersForLatestUserMessage,
  shouldPreferMarkdownTablesForLatestUserMessage,
  shouldResolveWorkspaceContextForLatestUserMessage,
  wasToolEverSelectedInSteps,
} from '../mira-render-ui-policy';

describe('mira render_ui policy', () => {
  it('forces render_ui when latest user message explicitly requires it', () => {
    const messages: ModelMessage[] = [
      { role: 'assistant', content: 'Here is the output.' },
      {
        role: 'user',
        content:
          'It must use render_ui tool, and not like this. Use render_ui instead.',
      },
    ];

    expect(shouldForceRenderUiForLatestUserMessage(messages)).toBe(true);
  });

  it('does not force render_ui for normal user messages', () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: 'Can you summarize my tasks for today?',
      },
    ];

    expect(shouldForceRenderUiForLatestUserMessage(messages)).toBe(false);
  });

  it('forces google_search for explicit web lookup requests', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Search saigonsniper pricing for me' },
    ];

    expect(shouldForceGoogleSearchForLatestUserMessage(messages)).toBe(true);
  });

  it('forces google_search for realtime external info requests', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'What is the latest AI news today?' },
    ];

    expect(shouldForceGoogleSearchForLatestUserMessage(messages)).toBe(true);
  });

  it('does not force google_search for workspace-internal requests', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: "What's my task agenda today?" },
    ];

    expect(shouldForceGoogleSearchForLatestUserMessage(messages)).toBe(false);
  });

  it('does not force google_search for workspace search phrasing', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'search my tasks and board items' },
    ];

    expect(shouldForceGoogleSearchForLatestUserMessage(messages)).toBe(false);
  });

  it('forces google_search for explicit web search phrasing', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'search the web for latest tsgo updates' },
    ];

    expect(shouldForceGoogleSearchForLatestUserMessage(messages)).toBe(true);
  });

  it('returns false for google_search forcing when there is no user message', () => {
    const assistantOnly: ModelMessage[] = [
      { role: 'assistant', content: 'hello' },
    ];
    expect(shouldForceGoogleSearchForLatestUserMessage([])).toBe(false);
    expect(shouldForceGoogleSearchForLatestUserMessage(assistantOnly)).toBe(
      false
    );
  });

  it('returns false for google_search forcing when user content is empty/whitespace', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: '   ' }];
    expect(shouldForceGoogleSearchForLatestUserMessage(messages)).toBe(false);
  });

  it('prefers native markdown tables for generic table requests', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'show me a table of useful content' },
    ];

    expect(shouldPreferMarkdownTablesForLatestUserMessage(messages)).toBe(true);
  });

  it('does not force markdown tables when user explicitly asks for visual ui', () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content:
          'show the data in a table but render_ui card dashboard style please',
      },
    ];

    expect(shouldPreferMarkdownTablesForLatestUserMessage(messages)).toBe(
      false
    );
  });

  it('returns false for markdown table preference with no user message', () => {
    const assistantOnly: ModelMessage[] = [
      { role: 'assistant', content: 'hello' },
    ];
    expect(shouldPreferMarkdownTablesForLatestUserMessage([])).toBe(false);
    expect(shouldPreferMarkdownTablesForLatestUserMessage(assistantOnly)).toBe(
      false
    );
  });

  it('returns false for markdown table preference when user content is empty/whitespace', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: '    ' }];
    expect(shouldPreferMarkdownTablesForLatestUserMessage(messages)).toBe(
      false
    );
  });

  it('requires workspace context resolution when a named workspace is in the request', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: "what's my tasks in tuturuuu" },
    ];

    expect(shouldResolveWorkspaceContextForLatestUserMessage(messages)).toBe(
      true
    );
  });

  it('does not mistake status phrasing for a workspace name', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: "what's my tasks in progress" },
    ];

    expect(shouldResolveWorkspaceContextForLatestUserMessage(messages)).toBe(
      false
    );
  });

  it('forces the workspace members tool for workspace member questions', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: "who's in my workspace?" },
    ];

    expect(shouldForceWorkspaceMembersForLatestUserMessage(messages)).toBe(
      true
    );
  });

  it('forces workspace context resolution for named workspace member questions', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: "who's in tuturuuu workspace?" },
    ];

    expect(shouldResolveWorkspaceContextForLatestUserMessage(messages)).toBe(
      true
    );
    expect(shouldForceWorkspaceMembersForLatestUserMessage(messages)).toBe(
      true
    );
  });

  it('extracts selected tools from latest select_tools call', () => {
    const steps = [
      {
        toolCalls: [
          {
            toolName: 'select_tools',
            args: { tools: ['get_my_tasks'] },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: 'select_tools',
            args: { tools: ['get_my_tasks', 'render_ui'] },
          },
        ],
      },
    ];

    expect(extractSelectedToolsFromSteps(steps)).toEqual([
      'get_my_tasks',
      'render_ui',
    ]);
  });

  it('extracts selected tools from select_tools result output when call args are missing', () => {
    const steps = [
      {
        toolResults: [
          {
            toolName: 'select_tools',
            output: { selectedTools: ['render_ui'] },
          },
        ],
      },
    ];

    expect(extractSelectedToolsFromSteps(steps)).toEqual(['render_ui']);
  });

  it('detects whether render_ui has been called in steps', () => {
    const steps = [
      {
        toolCalls: [
          {
            toolName: 'get_my_tasks',
            args: {},
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: 'render_ui',
            args: { root: 'root', elements: {} },
          },
        ],
      },
    ];

    expect(hasToolCallInSteps(steps, 'render_ui')).toBe(true);
    expect(hasToolCallInSteps(steps, 'create_task')).toBe(false);
  });

  it('requires render_ui to produce a non-empty renderable spec', () => {
    const steps = [
      {
        toolResults: [
          {
            toolName: 'render_ui',
            output: {
              spec: { root: 'agenda_root', elements: {} },
            },
          },
        ],
      },
    ];

    expect(hasRenderableRenderUiInSteps(steps)).toBe(false);
  });

  it('accepts wrapped render_ui outputs when they contain a valid spec', () => {
    const steps = [
      {
        toolResults: [
          {
            toolName: 'render_ui',
            output: {
              output: {
                spec: {
                  root: 'agenda_root',
                  elements: {
                    agenda_root: {
                      type: 'Stack',
                      props: {},
                      children: [],
                    },
                  },
                },
              },
            },
          },
        ],
      },
    ];

    expect(hasRenderableRenderUiInSteps(steps)).toBe(true);
  });

  it('ignores render_ui outputs recovered by auto recovery flags', () => {
    const steps = [
      {
        toolResults: [
          {
            toolName: 'render_ui',
            output: {
              autoRecoveredFromInvalidSpec: true,
              spec: {
                root: 'agenda_root',
                elements: {
                  agenda_root: {
                    type: 'Stack',
                    props: {},
                    children: [],
                  },
                },
              },
            },
          },
        ],
      },
    ];

    expect(hasRenderableRenderUiInSteps(steps)).toBe(false);
  });

  it('does not count auto-recovered render_ui outputs as final success', () => {
    const steps = [
      {
        toolResults: [
          {
            toolName: 'render_ui',
            output: {
              spec: {
                root: 'action_card',
                elements: {
                  action_card: {
                    type: 'Card',
                    props: { title: 'UI Generation Recovery' },
                    children: ['action_card__message'],
                  },
                  action_card__message: {
                    type: 'Text',
                    props: { content: 'Recovery placeholder' },
                    children: [],
                  },
                },
              },
              recoveredFromInvalidSpec: true,
            },
          },
        ],
      },
    ];

    expect(hasRenderableRenderUiInSteps(steps)).toBe(false);
  });

  it('builds active tools without implicit no_action_needed', () => {
    expect(buildActiveToolsFromSelected(['render_ui'])).toEqual([
      'render_ui',
      'select_tools',
    ]);
    expect(buildActiveToolsFromSelected(['no_action_needed'])).toEqual([
      'select_tools',
      'no_action_needed',
    ]);
  });

  it('detects when render_ui was selected earlier in the turn', () => {
    const steps = [
      {
        toolCalls: [
          {
            toolName: 'select_tools',
            args: { tools: ['render_ui'] },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: 'select_tools',
            args: { tools: ['no_action_needed'] },
          },
        ],
      },
    ];

    expect(wasToolEverSelectedInSteps(steps, 'render_ui')).toBe(true);
  });
});
