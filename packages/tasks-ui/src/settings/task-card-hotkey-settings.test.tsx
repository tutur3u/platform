import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskCardHotkeySettings } from './task-card-hotkey-settings';

const mutate = vi.fn();
vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserConfig: () => ({ data: '', isLoading: false }),
  useUpdateUserConfig: () => ({ mutate, isPending: false }),
}));
vi.mock('@tuturuuu/utils/hooks/use-platform', () => ({
  usePlatform: () => ({ modKey: 'Ctrl' }),
}));
const translate = (key: string, values?: { action?: string }) =>
  values?.action ? `${key}:${values.action}` : key;

describe('TaskCardHotkeySettings', () => {
  it('records a customized shortcut and persists the full map', () => {
    render(<TaskCardHotkeySettings translate={translate} />);
    const priorityButton = screen
      .getByText('priority')
      .closest('.grid')
      ?.querySelector('button');
    expect(priorityButton).toBeTruthy();

    fireEvent.click(priorityButton!);
    fireEvent.keyDown(priorityButton!, {
      key: '1',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: 'TASK_CARD_HOTKEYS',
        value: expect.stringContaining('"priority":"Mod+Shift+1"'),
      })
    );
  });

  it('reports collisions instead of saving an ambiguous shortcut', () => {
    mutate.mockClear();
    render(<TaskCardHotkeySettings translate={translate} />);
    const labelsButton = screen.getByText('L').closest('button');
    fireEvent.click(labelsButton!);
    fireEvent.keyDown(labelsButton!, { key: 'p' });

    expect(screen.getByText('shortcut_conflict:priority')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
