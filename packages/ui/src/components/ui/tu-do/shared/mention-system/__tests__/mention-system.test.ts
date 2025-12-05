import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMentionSuggestions } from '../use-mention-suggestions';
import {
  normalizeForSearch,
  isSameSuggestionState,
  createInitialSuggestionState,
} from '../types';

describe('useMentionSuggestions', () => {
  const mockMembers = [
    { user_id: 'user-1', display_name: 'John Doe', avatar_url: null },
    { user_id: 'user-2', display_name: 'Jane Smith', avatar_url: null },
  ];

  const mockWorkspaces = [
    { id: 'ws-1', name: 'Engineering', handle: 'eng', personal: false },
    { id: 'ws-2', name: 'Personal', handle: null, personal: true },
  ];

  const mockProjects = [
    { id: 'proj-1', name: 'Website Redesign', status: 'active' },
    { id: 'proj-2', name: 'Mobile App', status: 'planning' },
  ];

  const mockTasks = [
    {
      id: 'task-1',
      name: 'Fix login bug',
      list: { name: 'In Progress' },
    },
    {
      id: 'task-2',
      name: 'Update documentation',
      list: { name: 'To Do' },
    },
  ];

  it('should generate user mention options', () => {
    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: mockMembers,
        currentWorkspace: null,
        taskProjects: [],
        workspaceTasks: [],
        query: '',
      })
    );

    expect(result.current.mentionUserOptions).toHaveLength(2);
    expect(result.current.mentionUserOptions[0]!.type).toBe('user');
    expect(result.current.mentionUserOptions[0]!.label).toBe('Jane Smith');
  });

  it('should generate workspace mention options excluding personal', () => {
    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: [],
        currentWorkspace: mockWorkspaces[0]!, // Non-personal workspace
        taskProjects: [],
        workspaceTasks: [],
        query: '',
      })
    );

    expect(result.current.mentionWorkspaceOptions).toHaveLength(1);
    expect(result.current.mentionWorkspaceOptions[0]!.label).toBe(
      'Engineering'
    );
  });

  it('should generate project mention options', () => {
    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: [],
        currentWorkspace: null,
        taskProjects: mockProjects,
        workspaceTasks: [],
        query: '',
      })
    );

    expect(result.current.mentionProjectOptions).toHaveLength(2);
    expect(result.current.mentionProjectOptions[0]!.type).toBe('project');
  });

  it('should filter tasks excluding current task', () => {
    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: [],
        currentWorkspace: null,
        taskProjects: [],
        workspaceTasks: mockTasks,
        currentTaskId: 'task-1',
        query: '',
      })
    );

    expect(result.current.mentionTaskOptions).toHaveLength(1);
    expect(result.current.mentionTaskOptions[0]!.id).toBe('task-2');
  });

  it('should generate date mention options', () => {
    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: [],
        currentWorkspace: null,
        taskProjects: [],
        workspaceTasks: [],
        query: '',
      })
    );

    expect(result.current.mentionDateOptions).toHaveLength(5);
    expect(result.current.mentionDateOptions[0]!.id).toBe('today');
    expect(result.current.mentionDateOptions[4]!.id).toBe('custom-date');
  });

  it('should filter options by query', () => {
    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: mockMembers,
        currentWorkspace: null,
        taskProjects: [],
        workspaceTasks: [],
        query: 'john',
      })
    );

    const filtered = result.current.filteredMentionOptions;
    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.some((opt) => opt.label.toLowerCase().includes('john'))
    ).toBe(true);
  });

  it('should limit tasks when no query', () => {
    const manyTasks = Array.from({ length: 20 }, (_, i) => ({
      id: `task-${i}`,
      name: `Task ${i}`,
      list: { name: 'To Do' },
    }));

    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: [],
        currentWorkspace: null,
        taskProjects: [],
        workspaceTasks: manyTasks,
        query: '',
      })
    );

    const filtered = result.current.filteredMentionOptions;
    const taskCount = filtered.filter((opt) => opt.type === 'task').length;
    expect(taskCount).toBeLessThanOrEqual(8);
  });

  it('should show external user option when no matches', () => {
    const { result } = renderHook(() =>
      useMentionSuggestions({
        workspaceMembers: [],
        currentWorkspace: null,
        taskProjects: [],
        workspaceTasks: [],
        query: 'NonExistentUser',
      })
    );

    const filtered = result.current.filteredMentionOptions;
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.type).toBe('external-user');
    expect(filtered[0]!.label).toBe('NonExistentUser');
  });
});

describe('Mention utility functions', () => {
  describe('normalizeForSearch', () => {
    it('should convert to lowercase', () => {
      expect(normalizeForSearch('HELLO')).toBe('hello');
    });

    it('should remove diacritics', () => {
      expect(normalizeForSearch('café')).toBe('cafe');
      expect(normalizeForSearch('naïve')).toBe('naive');
    });

    it('should trim whitespace', () => {
      expect(normalizeForSearch('  hello  ')).toBe('hello');
    });

    it('should handle empty strings', () => {
      expect(normalizeForSearch('')).toBe('');
    });
  });

  describe('isSameSuggestionState', () => {
    it('should return true for identical states', () => {
      const state1 = createInitialSuggestionState();
      const state2 = createInitialSuggestionState();
      expect(isSameSuggestionState(state1, state2)).toBe(true);
    });

    it('should return false for different open states', () => {
      const state1 = { ...createInitialSuggestionState(), open: true };
      const state2 = createInitialSuggestionState();
      expect(isSameSuggestionState(state1, state2)).toBe(false);
    });

    it('should return false for different queries', () => {
      const state1 = { ...createInitialSuggestionState(), query: 'test' };
      const state2 = createInitialSuggestionState();
      expect(isSameSuggestionState(state1, state2)).toBe(false);
    });

    it('should return false for different ranges', () => {
      const state1 = {
        ...createInitialSuggestionState(),
        range: { from: 0, to: 5 },
      };
      const state2 = {
        ...createInitialSuggestionState(),
        range: { from: 0, to: 10 },
      };
      expect(isSameSuggestionState(state1, state2)).toBe(false);
    });

    it('should return false for different positions', () => {
      const state1 = {
        ...createInitialSuggestionState(),
        position: { left: 0, top: 0 },
      };
      const state2 = {
        ...createInitialSuggestionState(),
        position: { left: 10, top: 10 },
      };
      expect(isSameSuggestionState(state1, state2)).toBe(false);
    });
  });

  describe('createInitialSuggestionState', () => {
    it('should create closed state with no query', () => {
      const state = createInitialSuggestionState();
      expect(state.open).toBe(false);
      expect(state.query).toBe('');
      expect(state.range).toBeNull();
      expect(state.position).toBeNull();
    });
  });
});
