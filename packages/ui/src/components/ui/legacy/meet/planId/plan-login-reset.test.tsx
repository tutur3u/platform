import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuestPasswordReset } from './guest-password-reset';
import PlanLogin from './plan-login';

const state = vi.hoisted(() => ({
  messages: {} as Record<string, Record<string, string>>,
  guestLogin: vi.fn(),
  resetGuestPassword: vi.fn(),
  setUser: vi.fn(),
}));
vi.mock('@tuturuuu/apis/meet/actions', () => ({
  guestLogin: state.guestLogin,
  resetGuestPassword: state.resetGuestPassword,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/plans/fixture',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    const [group, ...rest] = key.split('.');
    return (
      state.messages[namespace ?? group!]?.[namespace ? key : rest.join('.')] ??
      key
    );
  },
}));
vi.mock('@tuturuuu/ui/hooks/time-blocking-provider', () => ({
  useTimeBlocking: () => ({
    user: null,
    originalPlatformUser: null,
    displayMode: 'login',
    setUser: state.setUser,
    setDisplayMode: vi.fn(),
  }),
}));
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each(['en', 'vi'])(
  'shows the %s legacy-reset outcome without logging in',
  async (locale) => {
    state.messages = JSON.parse(
      readFileSync(
        resolve(process.cwd(), '../../apps/meet/messages', `${locale}.json`),
        'utf8'
      )
    );
    state.guestLogin.mockResolvedValue({
      error: 'The plan creator must reset this guest password.',
      code: 'PASSWORD_RESET_REQUIRED',
    });
    const copy = state.messages['meet-together-plan-details']!;
    render(<PlanLogin plan={{ id: 'plan-1' }} baseUrl="" />);
    fireEvent.change(screen.getByLabelText(copy.your_name!), {
      target: { value: 'Ann' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: state.messages.common!.continue! })
    );
    expect(
      await screen.findByText(copy.guest_password_reset_required!)
    ).toBeVisible();
    expect(state.guestLogin).toHaveBeenCalledWith('plan-1', {
      name: 'Ann',
      password: '',
    });
    expect(state.setUser).not.toHaveBeenCalled();
  }
);

it.each(['en', 'vi'])(
  'lets the creator submit a %s reset without a participant-list entry',
  async (locale) => {
    state.messages = JSON.parse(
      readFileSync(
        resolve(process.cwd(), '../../apps/meet/messages', `${locale}.json`),
        'utf8'
      )
    );
    state.resetGuestPassword.mockResolvedValue({ data: { success: true } });
    const copy = state.messages['meet-together-plan-details']!;
    render(<GuestPasswordReset planId="plan-1" />);
    fireEvent.change(screen.getByLabelText(copy.guest_password_reset_guest!), {
      target: { value: 'Ann' },
    });
    const password = screen.getByLabelText(
      copy.guest_password_reset_new_password!
    );
    fireEvent.change(password, { target: { value: 'replacement password' } });
    fireEvent.click(
      screen.getByRole('button', { name: copy.guest_password_reset_title! })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      copy.guest_password_reset_success!
    );
    expect(state.resetGuestPassword).toHaveBeenCalledWith(
      'plan-1',
      'Ann',
      'replacement password'
    );
    expect(password).toHaveValue('');
    expect(state.setUser).not.toHaveBeenCalled();
  }
);
