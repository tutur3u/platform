import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageToggle } from './language-toggle';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

describe('LanguageToggle', () => {
  beforeEach(() => {
    router.refresh.mockReset();
    vi.restoreAllMocks();
  });

  it('refreshes after persisting the next locale without an app API route', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<LanguageToggle currentLocale="en" forceDisplay />);
    fireEvent.click(screen.getByRole('button', { name: 'enToggle language' }));

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain('NEXT_LOCALE=vi');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'enToggle language' })
    ).toBeEnabled();
  });
});
