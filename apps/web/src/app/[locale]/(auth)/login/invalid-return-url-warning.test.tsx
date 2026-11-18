// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidReturnUrlWarning } from './invalid-return-url-warning';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('InvalidReturnUrlWarning', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the target origin and confirms URL clearing', () => {
    const onClear = vi.fn();

    render(
      <InvalidReturnUrlWarning
        failure="invalid"
        onClear={onClear}
        returnUrl="https%3A%2F%2Fyashodauitwaru.com%2Fverify-token%3FnextUrl%3D%252Fadmin"
      />
    );

    expect(screen.getByText('login.invalid_return_url_title')).toBeTruthy();
    expect(screen.getByText('https://yashodauitwaru.com')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'login.clear_invalid_return_url',
      })
    );

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['handoff', 'login.cross_app_handoff_session_failed'],
    ['refresh', 'login.cross_app_handoff_refresh_failed'],
  ] as const)(
    'explains the %s failure and reloads on retry',
    (failure, description) => {
      const onClear = vi.fn();
      const reload = vi.fn();
      vi.stubGlobal('location', { reload });

      render(
        <InvalidReturnUrlWarning
          failure={failure}
          onClear={onClear}
          returnUrl="https://mail.tuturuuu.com/verify-token?nextUrl=%2Fpersonal%2Finbox"
        />
      );

      expect(
        screen.getByRole('heading', {
          name: 'login.cross_app_handoff_error_title',
        })
      ).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
      expect(
        screen.queryByText('login.invalid_return_url_hint')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'login.clear_invalid_return_url' })
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: 'login.cross_app_handoff_retry' })
      );

      expect(reload).toHaveBeenCalledOnce();
      expect(onClear).not.toHaveBeenCalled();
    }
  );
});
