import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { EditorChromeControls } from '../editor-chrome-controls';

describe('EditorChromeControls', () => {
  it('toggles collapsed editor chrome from section-local handles', () => {
    const onToggleLeft = vi.fn();
    const onToggleRight = vi.fn();
    const onToggleTop = vi.fn();
    const onToggleBottom = vi.fn();
    const onToggleChat = vi.fn();
    const onToggleNpcLab = vi.fn();

    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorChromeControls
          bottomCollapsed
          chatOpen={false}
          npcLabCollapsed={true}
          onToggleBottom={onToggleBottom}
          onToggleChat={onToggleChat}
          onToggleNpcLab={onToggleNpcLab}
          onToggleRight={onToggleRight}
          onToggleTop={onToggleTop}
          rightCollapsed
          topCollapsed={false}
        />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByTitle('Toggle inspector'));
    fireEvent.click(screen.getByTitle('Toggle NPC lab'));
    fireEvent.click(screen.getByRole('button', { name: 'Open agent chat' }));
    fireEvent.click(screen.getByTitle('Toggle tool dock'));

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorChromeControls
          bottomCollapsed={false}
          chatOpen
          npcLabCollapsed={false}
          onToggleBottom={onToggleBottom}
          onToggleChat={onToggleChat}
          onToggleNpcLab={onToggleNpcLab}
          onToggleRight={onToggleRight}
          onToggleTop={onToggleTop}
          rightCollapsed={false}
          topCollapsed
        />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByTitle('Toggle top panels'));

    expect(onToggleLeft).not.toHaveBeenCalled();
    expect(onToggleRight).toHaveBeenCalledOnce();
    expect(onToggleTop).toHaveBeenCalledOnce();
    expect(onToggleChat).toHaveBeenCalledOnce();
    expect(onToggleNpcLab).toHaveBeenCalledOnce();
    expect(onToggleBottom).toHaveBeenCalledOnce();
  });
});
