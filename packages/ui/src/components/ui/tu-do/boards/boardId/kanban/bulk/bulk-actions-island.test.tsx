import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BulkActionsIsland } from './bulk-actions-island';
import type { BulkActionsMenu } from './bulk-actions-menu';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./bulk-actions-menu', () => ({
  BulkActionsMenu: () => <div data-testid="bulk-actions-menu" />,
}));

const menuProps = {} as ComponentProps<typeof BulkActionsMenu>;

describe('BulkActionsIsland', () => {
  it('is hidden until at least one task is selected', () => {
    render(
      <BulkActionsIsland
        selectedCount={0}
        bulkWorking={false}
        onClearSelection={vi.fn()}
        onOpenBoardSelector={vi.fn()}
        menuProps={menuProps}
      />
    );

    expect(screen.queryByTestId('kanban-bulk-actions-island')).toBeNull();
  });

  it('renders compact bulk controls without the old instruction copy', () => {
    const onClearSelection = vi.fn();
    const onOpenBoardSelector = vi.fn();

    render(
      <BulkActionsIsland
        selectedCount={2}
        bulkWorking={false}
        onClearSelection={onClearSelection}
        onOpenBoardSelector={onOpenBoardSelector}
        menuProps={menuProps}
      />
    );

    const island = screen.getByTestId('kanban-bulk-actions-island');
    expect(island).toHaveTextContent('2 selected');
    expect(island).not.toHaveTextContent('selection_instruction');
    expect(screen.getByTestId('bulk-selection-status-icon')).toBeVisible();
    expect(island.firstElementChild).toHaveClass(
      'gap-0.5',
      'rounded-xl',
      'p-1'
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.move' }));
    expect(onOpenBoardSelector).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'common.clear' }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});
