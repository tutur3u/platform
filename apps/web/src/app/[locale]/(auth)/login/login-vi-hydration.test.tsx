// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { NextIntlClientProvider } from 'next-intl';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import viMessages from '../../../../../messages/vi.json';
import { IdentifyStep } from './identify-step';
import { LoginBrandHeader } from './login-brand';
import { LoginFooter } from './login-footer';
import { TurnstilePill } from './turnstile-pill';

vi.mock('./passkey-login-button', () => ({
  PasskeyLoginButton: ({ badge }: { badge?: React.ReactNode }) => (
    <button type="button">
      Tiếp tục với khóa đăng nhập
      {badge}
    </button>
  ),
}));

const roots: Root[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    act(() => {
      root?.unmount();
    });
  }
  localStorage.clear();
  document.body.innerHTML = '';
});

function ViLoginSurface() {
  const emailForm = useForm({
    defaultValues: { email: '' },
  });

  return (
    <NextIntlClientProvider locale="vi" messages={viMessages}>
      <div>
        <LoginBrandHeader app={null} multiAccount={false} pending={false} />
        <IdentifyStep
          autoFocusEmail={false}
          continueDisabled
          emailForm={emailForm}
          loading={false}
          normalizedPreviewEmail={null}
          onBlurUsername={() => {}}
          onChooseProvider={() => {}}
          onEmailInput={() => {}}
          onSubmit={() => {}}
          onUsePassword={() => {}}
          passkey={{
            canRenderTurnstile: true,
            onAuthenticated: async () => {},
            onCaptchaReset: () => {},
            requiresTurnstile: true,
          }}
          pending
          turnstile={{
            onRetry: () => {},
            state: 'checking',
            widget: <div data-testid="turnstile-widget-slot" />,
          }}
          usePasswordAvailable={false}
        />
        <LoginFooter />
      </div>
    </NextIntlClientProvider>
  );
}

describe('Login vi-VN SSR hydration', () => {
  it('hydrates TurnstilePill in checking state under vi locale without HTML nesting mismatch', async () => {
    const element = (
      <NextIntlClientProvider locale="vi" messages={viMessages}>
        <TurnstilePill state="checking">
          <div data-testid="widget" />
        </TurnstilePill>
      </NextIntlClientProvider>
    );

    const ssrHtml = renderToString(element);
    const container = document.createElement('div');
    container.innerHTML = ssrHtml;
    document.body.append(container);

    const serverStatus = container.querySelector('[role="status"]');
    expect(serverStatus).not.toBeNull();
    expect(serverStatus).toHaveTextContent(viMessages.login.turnstile_checking);
    // An invalid <div> inside <p> would make the HTML parser auto-close <p>
    // before the spinner, leaving [role="status"] empty before hydration.
    expect(serverStatus?.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('p div')).toBeNull();

    const recoverableErrors: unknown[] = [];
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      await act(async () => {
        roots.push(
          hydrateRoot(container, element, {
            onRecoverableError: (error) => {
              recoverableErrors.push(error);
            },
          })
        );
      });

      expect(recoverableErrors).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      expect(container.querySelector('[role="status"]')).toBe(serverStatus);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('hydrates the vi-VN login surface cleanly with no React #418 mismatch or invalid nesting', async () => {
    const element = <ViLoginSurface />;
    const ssrHtml = renderToString(element);
    const container = document.createElement('div');
    container.innerHTML = ssrHtml;
    document.body.append(container);

    const serverHeading = container.querySelector('h1');
    const serverStatus = container.querySelector('[role="status"]');
    expect(serverHeading).toHaveTextContent(
      viMessages.login.welcome_to_tuturuuu
    );
    expect(serverStatus).toHaveTextContent(viMessages.login.turnstile_checking);
    expect(container.querySelector('p div')).toBeNull();
    expect(container.querySelector('button div')).toBeNull();

    const recoverableErrors: unknown[] = [];
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      await act(async () => {
        roots.push(
          hydrateRoot(container, element, {
            onRecoverableError: (error) => {
              recoverableErrors.push(error);
            },
          })
        );
      });

      expect(recoverableErrors).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      expect(container.querySelector('h1')).toBe(serverHeading);
      expect(container.querySelector('[role="status"]')).toBe(serverStatus);
      expect(container.querySelector('a[href="/vi/terms"]')).toHaveTextContent(
        'Điều khoản'
      );
      expect(
        container.querySelector('a[href="/vi/privacy"]')
      ).toHaveTextContent('Chính sách quyền riêng tư');
      expect(
        container.querySelector('a[href="/vi/auth/recovery"]')
      ).toHaveTextContent(viMessages.login.trouble_signing_in);
    } finally {
      consoleError.mockRestore();
    }
  });
});
