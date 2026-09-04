import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenuSub: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: any) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: any) => <div>{children}</div>,
}));

import { TaskDueDateMenu } from '../task-due-date-menu';
import { TaskEstimationMenu } from '../task-estimation-menu';
import { TaskPriorityMenu } from '../task-priority-menu';

const runAction = (_event: Event, action: () => void) => action();

describe('searchable task assignment menus', () => {
  it('filters and assigns priority from the keyboard', () => {
    const onPriorityChange = vi.fn();
    const onClose = vi.fn();
    render(
      <TaskPriorityMenu
        currentPriority={null}
        isLoading={false}
        onPriorityChange={onPriorityChange}
        onMenuItemSelect={runAction}
        onClose={onClose}
      />
    );

    const search = screen.getByPlaceholderText('search...');
    fireEvent.change(search, { target: { value: 'high' } });

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.queryByText('Urgent')).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onPriorityChange).toHaveBeenCalledWith('high');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters and assigns a due-date preset from the keyboard', () => {
    const onDueDateChange = vi.fn();
    const onClose = vi.fn();
    render(
      <TaskDueDateMenu
        endDate={null}
        isLoading={false}
        onDueDateChange={onDueDateChange}
        onCustomDateClick={vi.fn()}
        onMenuItemSelect={runAction}
        onClose={onClose}
      />
    );

    const search = screen.getByPlaceholderText('search...');
    fireEvent.change(search, { target: { value: 'tomorrow' } });

    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onDueDateChange).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters and assigns estimation from the keyboard', () => {
    const onEstimationChange = vi.fn();
    const onClose = vi.fn();
    render(
      <TaskEstimationMenu
        currentPoints={null}
        estimationType="t-shirt"
        extendedEstimation={false}
        allowZeroEstimates={false}
        isLoading={false}
        onEstimationChange={onEstimationChange}
        onMenuItemSelect={runAction}
        onClose={onClose}
      />
    );

    const search = screen.getByPlaceholderText('search...');
    fireEvent.change(search, { target: { value: 'XL' } });

    expect(screen.getByText('XL')).toBeInTheDocument();
    expect(screen.queryByText('XS')).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onEstimationChange).toHaveBeenCalledWith(5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
