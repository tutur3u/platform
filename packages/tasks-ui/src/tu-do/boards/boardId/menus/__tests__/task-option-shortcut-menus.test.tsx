import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskEstimationMenu } from '../task-estimation-menu';
import { TaskPriorityMenu } from '../task-priority-menu';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenuSub: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSubContent: ({
    children,
    onKeyDownCapture,
  }: {
    children: ReactNode;
    onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
  }) => <div onKeyDownCapture={onKeyDownCapture}>{children}</div>,
}));

const runMenuAction = (_event: Event, action: () => void) => action();

describe('task option shortcut menus', () => {
  it('assigns the numbered visible priority without typing into search', () => {
    const onPriorityChange = vi.fn();
    render(
      <TaskPriorityMenu
        forceOpen
        currentPriority={null}
        isLoading={false}
        onPriorityChange={onPriorityChange}
        onMenuItemSelect={runMenuAction}
        onClose={vi.fn()}
      />
    );

    const search = screen.getByRole('combobox');
    fireEvent.keyDown(search, { key: '2' });
    expect(onPriorityChange).toHaveBeenCalledWith('high');
    expect(search).toHaveValue('');
  });

  it('assigns estimation with 1-9 and clears it with 0', () => {
    const onEstimationChange = vi.fn();
    render(
      <TaskEstimationMenu
        forceOpen
        currentPoints={null}
        estimationType="fibonacci"
        extendedEstimation={false}
        allowZeroEstimates={false}
        isLoading={false}
        onEstimationChange={onEstimationChange}
        onMenuItemSelect={runMenuAction}
        onClose={vi.fn()}
      />
    );

    const search = screen.getByRole('combobox');
    fireEvent.keyDown(search, { key: '3' });
    expect(onEstimationChange).toHaveBeenCalledWith(3);

    fireEvent.keyDown(search, { key: '0' });
    expect(onEstimationChange).toHaveBeenLastCalledWith(null);
  });
});
