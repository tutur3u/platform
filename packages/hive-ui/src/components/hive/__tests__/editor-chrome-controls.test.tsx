import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../test/messages/en.json';
import { EditorChromeControls } from '../editor-chrome-controls';

describe('EditorChromeControls', () => {
  it('toggles collapsed top and bottom chrome from restore handles', () => {
    const onToggleTop = vi.fn();
    const onToggleBottom = vi.fn();

    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorChromeControls
          bottomCollapsed
          onToggleBottom={onToggleBottom}
          onToggleTop={onToggleTop}
          topCollapsed
        />
      </NextIntlClientProvider>
    );

    fireEvent.click(screen.getByTitle('Toggle tool dock'));
    fireEvent.click(screen.getByTitle('Toggle top panels'));

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditorChromeControls
          bottomCollapsed={false}
          onToggleBottom={onToggleBottom}
          onToggleTop={onToggleTop}
          topCollapsed={false}
        />
      </NextIntlClientProvider>
    );

    expect(onToggleTop).toHaveBeenCalledOnce();
    expect(onToggleBottom).toHaveBeenCalledOnce();
  });
});
