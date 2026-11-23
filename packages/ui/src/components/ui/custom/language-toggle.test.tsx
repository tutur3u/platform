import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageToggle } from './language-toggle';

const originalLocation = window.location;
const assign = vi.fn();

describe('LanguageToggle', () => {
  beforeEach(() => {
    assign.mockReset();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/', search: '', hash: '', assign, reload: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('loads the page under the next locale after persisting it, without an app API route', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<LanguageToggle currentLocale="en" forceDisplay />);
    fireEvent.click(screen.getByRole('button', { name: 'enToggle language' }));

    expect(assign).toHaveBeenCalledWith('/vi');
    expect(document.cookie).toContain('NEXT_LOCALE=vi');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'enToggle language' })
    ).toBeEnabled();
  });
});
