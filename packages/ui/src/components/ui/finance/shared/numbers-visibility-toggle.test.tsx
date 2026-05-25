import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceNumbersVisibilityToggle } from './numbers-visibility-toggle';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('FinanceNumbersVisibilityToggle', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });

  it('persists visibility state and notifies other finance widgets', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<FinanceNumbersVisibilityToggle />);

    const toggle = screen.getByRole('button', {
      name: 'show_confidential',
    });
    fireEvent.click(toggle);

    expect(document.cookie).toContain('finance-confidential-mode=false');
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finance-confidential-mode-change',
      })
    );
    expect(
      screen.getByRole('button', {
        name: 'hide_confidential',
      })
    ).toBeVisible();
  });
});
