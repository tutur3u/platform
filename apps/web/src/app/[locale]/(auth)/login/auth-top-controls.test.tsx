// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthTopControls } from './auth-top-controls';

const mocks = vi.hoisted(() => ({
  persist: vi.fn(),
  replace: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams('returnUrl=https%3A%2F%2Fchat.tuturuuu.com%2F'),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: mocks.setTheme }),
}));
vi.mock('@tuturuuu/ui/custom/locale-preference', () => ({
  persistLocalePreference: mocks.persist,
}));
vi.mock('@/constants/common', () => ({ LOCALE_COOKIE_NAME: 'NEXT_LOCALE' }));
vi.mock('@/i18n/routing', () => ({
  supportedLocales: ['en', 'vi'],
  usePathname: () => '/login',
  useRouter: () => ({ replace: mocks.replace }),
}));

beforeEach(() => vi.clearAllMocks());

describe('AuthTopControls', () => {
  it('orders the language segment before the theme switch', () => {
    render(<AuthTopControls />);
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.map((button) => button.textContent || button.ariaLabel)
    ).toEqual(['en', 'vi', 'switch_theme']);
    expect(screen.getByRole('group', { name: 'language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'en' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches locale through the shared cookie and keeps the query', () => {
    render(<AuthTopControls />);
    fireEvent.click(screen.getByRole('button', { name: 'vi' }));
    expect(mocks.persist).toHaveBeenCalledWith('vi', 'NEXT_LOCALE');
    expect(mocks.replace).toHaveBeenCalledWith(
      '/login?returnUrl=https%3A%2F%2Fchat.tuturuuu.com%2F',
      { locale: 'vi', scroll: false }
    );
    fireEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it('switches the theme through the app theme provider', () => {
    render(<AuthTopControls />);
    fireEvent.click(screen.getByRole('button', { name: 'switch_theme' }));
    expect(mocks.setTheme).toHaveBeenCalledWith('dark');
  });
});
