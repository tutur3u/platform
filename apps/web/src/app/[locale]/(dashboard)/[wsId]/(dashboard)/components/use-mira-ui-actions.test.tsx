import { renderHook } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import {
  type SidebarBehavior,
  SidebarContext,
} from '@tuturuuu/ui/custom/sidebar-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMiraUiActions } from './use-mira-ui-actions';

const mocks = vi.hoisted(() => ({
  setTheme: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  closeAll: vi.fn(),
  focus: vi.fn(),
  setLayout: vi.fn(),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: mocks.setTheme }),
}));
vi.mock('./mira-workspace-state', () => ({
  artifactKinds: ['tasks', 'calendar', 'finance', 'meetings'],
  useMiraWorkspace: () => mocks,
}));
function message(
  name: string,
  output: Record<string, unknown>,
  state = 'output-available'
): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      { type: `tool-${name}`, toolCallId: 'call-1', state, input: {}, output },
    ],
  } as UIMessage;
}
describe('Mira streamed UI actions', () => {
  beforeEach(() => vi.clearAllMocks());
  it('applies theme as soon as a tool output arrives, without a mounted result card', () => {
    const { rerender } = renderHook(
      ({ messages, status }) => useMiraUiActions(messages, status),
      { initialProps: { messages: [] as UIMessage[], status: 'ready' } }
    );
    rerender({
      messages: [message('set_theme', {}, 'input-available')],
      status: 'streaming',
    });
    rerender({
      messages: [message('set_theme', { success: true, theme: 'dark' })],
      status: 'streaming',
    });
    expect(mocks.setTheme).toHaveBeenCalledWith('dark');
    rerender({
      messages: [message('set_theme', { success: true, theme: 'dark' })],
      status: 'ready',
    });
    expect(mocks.setTheme).toHaveBeenCalledTimes(1);
  });
  it('never replays theme commands from restored history, including on the next turn', () => {
    const history = [message('set_theme', { success: true, theme: 'light' })];
    const { rerender } = renderHook(
      ({ status }) => useMiraUiActions(history, status),
      { initialProps: { status: 'ready' } }
    );
    rerender({ status: 'submitted' });
    expect(mocks.setTheme).not.toHaveBeenCalled();
  });
  it('opens an artifact in the tool workspace and requested arrangement', () => {
    renderHook(() =>
      useMiraUiActions(
        [
          message('show_workspace_artifact', {
            success: true,
            kind: 'calendar',
            layout: 'vertical',
            wsId: 'workspace-2',
          }),
        ],
        'streaming'
      )
    );
    expect(mocks.open).toHaveBeenCalledWith(
      'calendar',
      'workspace-2',
      'vertical',
      undefined
    );
  });
  it.each([
    ['close_artifact', { kind: 'tasks' }, 'close', ['tasks', 'workspace-2']],
    [
      'focus_artifact',
      { kind: 'finance' },
      'focus',
      ['finance', 'workspace-2'],
    ],
    ['set_layout', { layout: 'grid' }, 'setLayout', ['grid']],
    ['close_all', {}, 'closeAll', []],
  ] as const)(
    'applies %s from a tool response',
    (operation, args, method, expected) => {
      renderHook(() =>
        useMiraUiActions(
          [
            message('manage_workspace', {
              success: true,
              wsId: 'workspace-2',
              operation,
              ...args,
            }),
          ],
          'streaming'
        )
      );
      expect(mocks[method]).toHaveBeenCalledWith(...expected);
    }
  );
  it('passes tailored presentation to the artifact', () => {
    const presentation = {
      title: 'This week',
      taskStatus: 'overdue',
      itemIds: ['task-1'],
    };
    renderHook(() =>
      useMiraUiActions(
        [
          message('show_workspace_artifact', {
            success: true,
            wsId: 'workspace-2',
            kind: 'tasks',
            presentation,
          }),
        ],
        'streaming'
      )
    );
    expect(mocks.open).toHaveBeenCalledWith(
      'tasks',
      'workspace-2',
      undefined,
      presentation
    );
  });
  it.each(['expanded', 'collapsed', 'hover', 'hidden'] as const)(
    'applies the %s sidebar state through the preference provider',
    (behavior) => {
      const change = vi.fn();
      renderHook(
        () =>
          useMiraUiActions(
            [message('set_sidebar', { success: true, behavior })],
            'streaming'
          ),
        {
          wrapper: ({ children }) => (
            <SidebarContext.Provider
              value={{
                behavior: 'expanded' as SidebarBehavior,
                setBehavior: vi.fn(),
                handleBehaviorChange: change,
                localOverride: false,
                setLocalOverride: vi.fn(),
              }}
            >
              {children}
            </SidebarContext.Provider>
          ),
        }
      );
      expect(change).toHaveBeenCalledWith(behavior);
    }
  );
  it('ignores failed and invalid UI commands', () => {
    renderHook(() =>
      useMiraUiActions(
        [
          message('set_theme', {
            success: true,
            error: 'denied',
            theme: 'light',
          }),
        ],
        'streaming'
      )
    );
    expect(mocks.setTheme).not.toHaveBeenCalled();
  });
});
