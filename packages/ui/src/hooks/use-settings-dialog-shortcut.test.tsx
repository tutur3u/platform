import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsDialogShortcut } from './use-settings-dialog-shortcut';

function Shell({ onOpen }: { onOpen: () => void }) {
  useSettingsDialogShortcut({ enabled: true, onOpen });
  return (
    <div contentEditable suppressContentEditableWarning>
      <span>Editor content</span>
    </div>
  );
}
describe('shared app settings shortcut', () => {
  it('supports both platforms without stealing editor, composition, or modified commands', () => {
    const onOpen = vi.fn();
    render(<Shell onOpen={onOpen} />);
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    fireEvent.keyDown(window, { key: ',', metaKey: true });
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByText('Editor content'), {
      key: ',',
      ctrlKey: true,
    });
    for (const options of [
      { isComposing: true },
      { repeat: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      fireEvent.keyDown(window, { key: ',', ctrlKey: true, ...options });
    }
    const event = new KeyboardEvent('keydown', {
      key: ',',
      ctrlKey: true,
      cancelable: true,
    });
    event.preventDefault();
    fireEvent(window, event);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
