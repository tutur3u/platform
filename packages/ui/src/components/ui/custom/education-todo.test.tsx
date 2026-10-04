import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EducationTodo } from './education-todo';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
  error: false,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => {
    state.query(options);
    return {
      isError: state.error,
      isPending: false,
      refetch: state.refetch,
      data: {
        count: 30,
        totalPages: 2,
        data: [
          {
            id: 'done',
            title: 'Completed synthetic work',
            courseId: 'course',
            completed: true,
          },
          {
            id: 'open',
            title: 'Open synthetic work',
            courseId: 'course',
            completed: false,
          },
        ],
      },
    };
  },
}));
vi.mock('@tuturuuu/internal-api/teach', () => ({ listEducationTodo: vi.fn() }));
const translate = (key: string) => key;
describe('personal education work controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.error = false;
  });
  it('separates actor caches, paginates and resets page on category switch', () => {
    const { rerender } = render(
      <EducationTodo
        app="learn"
        wsId="workspace"
        actorId="actor-one"
        t={translate}
      />
    );
    expect(state.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: [
          'education-todo',
          'learn',
          'workspace',
          'actor-one',
          'tutoring',
          1,
        ],
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(state.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: [
          'education-todo',
          'learn',
          'workspace',
          'actor-one',
          'tutoring',
          2,
        ],
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'assignments' }));
    expect(screen.queryByText('Completed synthetic work')).toBeNull();
    expect(screen.getByText('Open synthetic work')).toBeTruthy();
    expect(state.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: [
          'education-todo',
          'learn',
          'workspace',
          'actor-one',
          'assignments',
          1,
        ],
      })
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Completed synthetic work')).toBeTruthy();
    rerender(
      <EducationTodo
        app="learn"
        wsId="workspace"
        actorId="actor-two"
        t={translate}
      />
    );
    expect(state.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: [
          'education-todo',
          'learn',
          'workspace',
          'actor-two',
          'assignments',
          1,
        ],
      })
    );
  });
  it('offers retry on errors without rendering stale assigned rows', () => {
    state.error = true;
    render(
      <EducationTodo
        app="teach"
        wsId="workspace"
        actorId="actor"
        t={translate}
      />
    );
    expect(screen.queryByText('Open synthetic work')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
