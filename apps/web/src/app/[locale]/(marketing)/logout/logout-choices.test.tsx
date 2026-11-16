// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import viMessages from '../../../../../messages/vi.json';
import { LogoutChoices } from './logout-choices';

const mocks = vi.hoisted(() => {
  const locale: { locale: 'en' | 'vi' } = { locale: 'en' };
  return {
    app: vi.fn(),
    browser: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
    ...locale,
  };
});
vi.mock('./logout-navigation', () => ({ navigateFromLogout: mocks.push }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('@tuturuuu/internal-api/auth', () => ({
  logoutBrowserSessionWithInternalApi: mocks.browser,
  logoutSatelliteAppWithInternalApi: mocks.app,
}));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TuturuuLogo: () => null,
  TUTURUUU_LOCAL_LOGO_URL: '/logo.png',
}));
vi.mock('@tuturuuu/ui/custom/loading-indicator', () => ({
  LoadingIndicator: () => <span role="progressbar" />,
}));
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: () =>
      actual.createTranslator({
        locale: mocks.locale,
        namespace: 'logout',
        messages: mocks.locale === 'en' ? en : viMessages,
      }),
  };
});

const target = { name: 'Tasks', origin: 'https://tasks.tuturuuu.com' };
const view = () =>
  render(<LogoutChoices target={target} email="fixture@example.test" />);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locale = 'en';
  mocks.app.mockResolvedValue({ success: true });
  mocks.browser.mockResolvedValue({ success: true });
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe('ask-first logout', () => {
  it.each<['en' | 'vi', string, string]>([
    ['en', 'Log out of Tasks only', 'Log out of all of Tuturuuu'],
    ['vi', 'Chỉ đăng xuất khỏi Tasks', 'Đăng xuất khỏi toàn bộ Tuturuuu'],
  ])(
    'renders concrete choices in %s without logging out on entry',
    (locale, app, browser) => {
      mocks.locale = locale;
      view();
      expect(screen.getByRole('button', { name: app })).toBeTruthy();
      expect(screen.getByRole('button', { name: browser })).toBeTruthy();
      expect(mocks.app).not.toHaveBeenCalled();
      expect(mocks.browser).not.toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
    }
  );

  it('goes back to the registered app without changing any session', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Go back to Tasks' }));
    expect(mocks.push).toHaveBeenCalledWith(target.origin);
    expect(mocks.app).not.toHaveBeenCalled();
    expect(mocks.browser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('logs out only the chosen app, without central logout or client sign-out', async () => {
    const completion = Promise.withResolvers<{ success: boolean }>();
    mocks.app.mockReturnValue(completion.promise);
    view();
    fireEvent.click(
      screen.getByRole('button', { name: 'Log out of Tasks only' })
    );
    expect(
      screen
        .getAllByRole('button')
        .every((button) => button.hasAttribute('disabled'))
    ).toBe(true);
    expect(mocks.app).toHaveBeenCalledWith({ baseUrl: target.origin });
    completion.resolve({ success: true });
    await screen.findByRole('heading', { name: 'Logged out of Tasks' });
    expect(
      screen.getByText('Your other apps were not logged out.')
    ).toBeTruthy();
    expect(mocks.browser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: en.logout['go-to-dashboard'] })
    );
    expect(mocks.push).toHaveBeenCalledWith('/');
  });

  it('ends only the current account browser session after the all-apps choice', async () => {
    view();
    fireEvent.click(
      screen.getByRole('button', { name: 'Log out of all of Tuturuuu' })
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login'));
    expect(mocks.browser).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it.each(['returned failure', 'rejected request'])(
    'recovers honestly from %s',
    async (mode) => {
      if (mode === 'returned failure')
        mocks.app.mockResolvedValue({ success: false });
      else mocks.app.mockRejectedValue(new Error('Fixture failure'));
      view();
      fireEvent.click(
        screen.getByRole('button', { name: 'Log out of Tasks only' })
      );
      await screen.findByRole('alert');
      expect(
        screen
          .getAllByRole('button')
          .every((button) => !button.hasAttribute('disabled'))
      ).toBe(true);
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.browser).not.toHaveBeenCalled();
    }
  );

  it('offers only app logout when the central session has already expired', () => {
    render(
      <LogoutChoices target={target} email={null} canLogoutBrowser={false} />
    );
    expect(
      screen.getByRole('button', { name: 'Log out of Tasks only' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Log out of all of Tuturuuu' })
    ).toBeNull();
    expect(mocks.browser).not.toHaveBeenCalled();
  });

  it('does not navigate when central browser logout fails', async () => {
    mocks.browser.mockRejectedValue(new Error('Fixture failure'));
    view();
    fireEvent.click(
      screen.getByRole('button', { name: 'Log out of all of Tuturuuu' })
    );
    await screen.findByRole('alert');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.app).not.toHaveBeenCalled();
  });

  it('does not offer app-only logout without a registered isolated target', () => {
    render(<LogoutChoices target={null} email="fixture@example.test" />);
    expect(
      screen.queryByRole('button', { name: 'Log out of Tasks only' })
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy();
  });
});
