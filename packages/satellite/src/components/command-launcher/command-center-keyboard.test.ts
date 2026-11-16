import { describe, expect, it } from 'vitest';
import {
  type CommandCenterKeyInput,
  type CommandCenterKeyState,
  resolveCommandCenterKey,
} from './command-center-keyboard';
import { cycleLauncherTab, parseLauncherQuery } from './command-launcher-tabs';

const key = (
  value: string,
  modifiers: Partial<CommandCenterKeyInput> = {}
): CommandCenterKeyInput => ({
  altKey: false,
  ctrlKey: false,
  key: value,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
});

const state = (
  overrides: Partial<CommandCenterKeyState> = {}
): CommandCenterKeyState => ({
  actionsOpen: false,
  activeTab: 'all',
  availableTabs: ['tasks', 'all', 'navigation', 'apps', 'actions'],
  caretAtEnd: true,
  defaultTab: 'all',
  hasSelectedActions: true,
  hasSelectedEntry: true,
  query: '',
  routedTab: 'all',
  ...overrides,
});

describe('resolveCommandCenterKey', () => {
  it('keeps Ctrl/Cmd+digit scope shortcuts in tab order', () => {
    expect(resolveCommandCenterKey(key('1', { ctrlKey: true }), state())).toEqual(
      { tab: 'tasks', type: 'scope' }
    );
    expect(resolveCommandCenterKey(key('3', { metaKey: true }), state())).toEqual(
      { tab: 'navigation', type: 'scope' }
    );
    expect(
      resolveCommandCenterKey(key('9', { ctrlKey: true }), state()).type
    ).toBe('none');
  });

  it('cycles scope with Tab only when more than one scope exists', () => {
    expect(resolveCommandCenterKey(key('Tab'), state())).toEqual({
      tab: 'navigation',
      type: 'scope',
    });
    expect(
      resolveCommandCenterKey(key('Tab', { shiftKey: true }), state())
    ).toEqual({ tab: 'tasks', type: 'scope' });
    expect(
      resolveCommandCenterKey(key('Tab'), state({ availableTabs: ['all'] }))
        .type
    ).toBe('none');
  });

  it('leaves an entered scope on Backspace only with an empty query', () => {
    const inScope = state({ activeTab: 'apps', routedTab: 'apps' });
    expect(resolveCommandCenterKey(key('Backspace'), inScope)).toEqual({
      tab: 'all',
      type: 'scope',
    });
    expect(
      resolveCommandCenterKey(key('Backspace'), { ...inScope, query: 'a' }).type
    ).toBe('none');
    expect(resolveCommandCenterKey(key('Backspace'), state()).type).toBe(
      'none'
    );
  });

  it('opens item actions only at the end of the query', () => {
    expect(resolveCommandCenterKey(key('ArrowRight'), state()).type).toBe(
      'actions-open'
    );
    expect(
      resolveCommandCenterKey(key('ArrowRight'), state({ caretAtEnd: false }))
        .type
    ).toBe('none');
    expect(
      resolveCommandCenterKey(
        key('ArrowRight'),
        state({ hasSelectedActions: false })
      ).type
    ).toBe('none');
  });

  it('routes arrows, Enter and ArrowLeft to an open action panel', () => {
    const open = state({ actionsOpen: true });
    expect(resolveCommandCenterKey(key('ArrowDown'), open)).toEqual({
      delta: 1,
      type: 'actions-move',
    });
    expect(resolveCommandCenterKey(key('ArrowUp'), open)).toEqual({
      delta: -1,
      type: 'actions-move',
    });
    expect(resolveCommandCenterKey(key('Enter'), open).type).toBe(
      'actions-run'
    );
    expect(resolveCommandCenterKey(key('ArrowLeft'), open).type).toBe(
      'actions-close'
    );
    expect(resolveCommandCenterKey(key('Tab'), open).type).toBe('none');
  });

  it('opens in a new tab with Ctrl/Cmd+Enter and leaves plain Enter to cmdk', () => {
    expect(
      resolveCommandCenterKey(key('Enter', { metaKey: true }), state()).type
    ).toBe('open-new-tab');
    expect(resolveCommandCenterKey(key('Enter'), state()).type).toBe('none');
    expect(
      resolveCommandCenterKey(
        key('Enter', { ctrlKey: true }),
        state({ hasSelectedEntry: false })
      ).type
    ).toBe('none');
  });

  it('ignores every binding while an input method is composing', () => {
    expect(
      resolveCommandCenterKey(key('Tab', { isComposing: true }), state()).type
    ).toBe('none');
  });
});

describe('scope helpers', () => {
  it('parses every scope prefix', () => {
    expect(parseLauncherQuery('#bug')).toEqual({ query: 'bug', tab: 'tasks' });
    expect(parseLauncherQuery('/ set')).toEqual({
      query: 'set',
      tab: 'navigation',
    });
    expect(parseLauncherQuery('@fin')).toEqual({ query: 'fin', tab: 'apps' });
    expect(parseLauncherQuery('>new')).toEqual({ query: 'new', tab: 'actions' });
    expect(parseLauncherQuery('plain')).toEqual({ query: 'plain', tab: null });
  });

  it('wraps scope cycling in both directions', () => {
    const tabs = ['all', 'apps'] as const;
    expect(cycleLauncherTab(tabs, 'apps', 1)).toBe('all');
    expect(cycleLauncherTab(tabs, 'all', -1)).toBe('apps');
  });
});
