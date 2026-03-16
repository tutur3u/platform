import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskLabelsDisplay } from './task-labels-display';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'dark',
  }),
}));

vi.mock('@tuturuuu/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('TaskLabelsDisplay', () => {
  it('deduplicates malformed labels and renders stable output', () => {
    render(
      <TaskLabelsDisplay
        labels={[
          {
            id: 'label-1',
            name: 'Bug',
            color: 'red',
            created_at: '2026-03-13T00:00:00.000Z',
          },
          {
            id: 'label-1',
            name: 'Bug',
            color: 'red',
            created_at: '2026-03-13T00:00:00.000Z',
          },
          {
            id: 'label-2',
            name: 'Feature',
            color: undefined as any,
            created_at: '2026-03-13T00:00:00.000Z',
          },
        ]}
      />
    );

    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Feature')).toBeInTheDocument();
    expect(screen.getAllByText('Bug')).toHaveLength(1);
  });
});
