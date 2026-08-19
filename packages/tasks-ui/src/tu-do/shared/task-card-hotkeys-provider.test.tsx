import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TASK_CARD_HOTKEY_EVENT } from './task-card-hotkeys';
import { TaskCardHotkeysProvider } from './task-card-hotkeys-provider';

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserConfig: () => ({ data: '{"priority":"Shift+1"}' }),
}));

describe('TaskCardHotkeysProvider', () => {
  it('dispatches the configured action only to the hovered task card', () => {
    render(
      <TaskCardHotkeysProvider>
        <div data-task-id="task-1">First</div>
        <div data-task-id="task-2">Second</div>
      </TaskCardHotkeysProvider>
    );
    const first = screen.getByText('First');
    const second = screen.getByText('Second');
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    first.addEventListener(TASK_CARD_HOTKEY_EVENT, firstHandler);
    second.addEventListener(TASK_CARD_HOTKEY_EVENT, secondHandler);

    fireEvent.pointerOver(second);
    fireEvent.keyDown(window, { key: '1', shiftKey: true });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(second).toHaveAttribute('data-task-hotkey-target', 'true');
  });

  it('does not intercept shortcuts while editing text', () => {
    render(
      <TaskCardHotkeysProvider>
        <div data-task-id="task-1">
          <input aria-label="Task name" />
        </div>
      </TaskCardHotkeysProvider>
    );
    const input = screen.getByLabelText('Task name');
    const card = input.closest('[data-task-id]') as HTMLElement;
    const handler = vi.fn();
    card.addEventListener(TASK_CARD_HOTKEY_EVENT, handler);

    fireEvent.pointerOver(card);
    fireEvent.keyDown(input, { key: '1', shiftKey: true });

    expect(handler).not.toHaveBeenCalled();
  });
});
