import { cleanup, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const location = vi.hoisted(() => ({ pathname: '/ws-a/boards/a' }));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location }),
}));

import { PageTransition, TasksPageLoading } from './page-transition';

afterEach(cleanup);

describe('Tasks URL and loaded model boundary', () => {
  it('unmounts the retained board immediately and never reveals a late response', () => {
    let unmounts = 0;
    function Board({ id }: { id: string }) {
      const [snapshot] = useState(id);
      useEffect(
        () => () => {
          unmounts += 1;
        },
        []
      );
      return <div>{snapshot}</div>;
    }
    const view = (loadedPath: string, id: string) => (
      <PageTransition loadedPath={loadedPath}>
        <Board id={id} />
      </PageTransition>
    );
    location.pathname = '/ws-a/boards/a';
    const { rerender } = render(view(location.pathname, 'Board A'));
    expect(screen.getByText('Board A')).toBeTruthy();
    location.pathname = '/ws-a/boards/b';
    rerender(view('/ws-a/boards/a', 'Board A'));
    expect(screen.queryByText('Board A')).toBeNull();
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(unmounts).toBe(1);
    location.pathname = '/ws-b/boards/c';
    rerender(view('/ws-a/boards/b', 'Board B'));
    expect(screen.queryByText('Board B')).toBeNull();
    rerender(view(location.pathname, 'Board C'));
    expect(screen.getByText('Board C')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('allows the matching model again after back navigation', () => {
    location.pathname = '/vi/ws/boards/a';
    const { rerender } = render(
      <PageTransition loadedPath={location.pathname}>Board A</PageTransition>
    );
    location.pathname = '/vi/other/boards/a';
    rerender(
      <PageTransition loadedPath="/vi/ws/boards/a">Board A</PageTransition>
    );
    expect(screen.queryByText('Board A')).toBeNull();
    location.pathname = '/vi/ws/boards/a';
    rerender(
      <PageTransition loadedPath={location.pathname}>Board A</PageTransition>
    );
    expect(screen.getByText('Board A')).toBeTruthy();
  });
});

describe('TasksPageLoading', () => {
  it.each(['/en/ws/boards/b1', '/ws/boards/b1/', '/en/ws/boards', '/ws/tasks'])(
    'shows the board header and columns for %s',
    (pathname) => {
      location.pathname = pathname;
      render(<TasksPageLoading />);
      expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeTruthy();
      expect(screen.getByTestId('task-board-header-skeleton')).toBeTruthy();
      expect(screen.getByTestId('kanban-skeleton')).toBeTruthy();
      expect(screen.getByRole('main')).toBeTruthy();
    }
  );

  it('fills the page without the shell offsets', () => {
    location.pathname = '/en/ws/boards/b1';
    render(<TasksPageLoading />);
    const state = screen.getByTestId('task-board-loading-state');
    expect(state.className).not.toContain('-ml-4');
    expect(state.className).toContain('w-full');
  });

  it('never falls back to a single full-width band', () => {
    location.pathname = '/en/ws/cycles';
    const { container } = render(<TasksPageLoading />);
    expect(container.querySelector('.h-40.w-full')).toBeNull();
    expect(
      container.querySelector('[data-slot="skeleton-list"]')
    ).not.toBeNull();
    expect(screen.queryByTestId('kanban-skeleton')).toBeNull();
  });
});
