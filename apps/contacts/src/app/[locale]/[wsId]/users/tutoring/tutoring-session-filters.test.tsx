// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceBasicUsers: vi.fn().mockResolvedValue({ count: 0, data: [] }),
}));

import { DEFAULT_SESSION_FILTERS } from './tutoring-filters';
import { TutoringSessionFiltersBar } from './tutoring-session-filters';

const groups = [
  { id: 'group-1', name: 'Class A' },
  { id: 'group-2', name: 'Class B' },
] as UserGroup[];

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('TutoringSessionFiltersBar', () => {
  it('emits a single facet change per press so other facets survive', () => {
    const onChange = vi.fn();

    render(
      withQueryClient(
        <TutoringSessionFiltersBar
          filters={DEFAULT_SESSION_FILTERS}
          groups={groups}
          onChange={onChange}
          onReset={vi.fn()}
          wsId="ws-1"
        />
      )
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'ws-tutoring.range_today' })
    );
    expect(onChange).toHaveBeenLastCalledWith({ dateRange: 'today' });

    fireEvent.click(
      screen.getByRole('button', { name: 'ws-tutoring.status_done' })
    );
    expect(onChange).toHaveBeenLastCalledWith({ attendanceStatus: 'DONE' });
  });

  it('marks the active preset as pressed for assistive tech', () => {
    render(
      withQueryClient(
        <TutoringSessionFiltersBar
          filters={{ ...DEFAULT_SESSION_FILTERS, dateRange: 'week' }}
          groups={groups}
          onChange={vi.fn()}
          onReset={vi.fn()}
          wsId="ws-1"
        />
      )
    );

    expect(
      screen.getByRole('button', { name: 'ws-tutoring.range_week' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'ws-tutoring.range_today' })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides reset until something is actually filtered', () => {
    const onReset = vi.fn();
    const { rerender } = render(
      withQueryClient(
        <TutoringSessionFiltersBar
          filters={DEFAULT_SESSION_FILTERS}
          groups={groups}
          onChange={vi.fn()}
          onReset={onReset}
          wsId="ws-1"
        />
      )
    );

    expect(
      screen.queryByRole('button', { name: /reset_filters/ })
    ).not.toBeInTheDocument();

    rerender(
      withQueryClient(
        <TutoringSessionFiltersBar
          filters={{ ...DEFAULT_SESSION_FILTERS, groupId: 'group-1' }}
          groups={groups}
          onChange={vi.fn()}
          onReset={onReset}
          wsId="ws-1"
        />
      )
    );

    fireEvent.click(screen.getByRole('button', { name: /reset_filters/ }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
