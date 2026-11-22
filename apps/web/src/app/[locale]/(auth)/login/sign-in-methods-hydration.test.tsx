// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLastLoginMethod } from './last-login-method';
import { SignInAlternatives } from './sign-in-methods';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

function slots(container: HTMLElement) {
  return [...container.querySelectorAll('[data-slot-index]')];
}

function Alternatives() {
  return (
    <SignInAlternatives
      disabled={false}
      lastUsed={useLastLoginMethod()}
      onChoose={() => {}}
      renderPasskey={(badge) => (
        <button type="button">
          login.continue_with_passkey
          {badge}
        </button>
      )}
    />
  );
}

describe('SignInAlternatives hydration', () => {
  it('fills a remembered method into the same slots without adding rows', async () => {
    const element = <Alternatives />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const serverSlots = slots(container);
    const serverButtons = container.querySelectorAll('button').length;
    expect(serverSlots).toHaveLength(2);
    expect(serverSlots[0]).toHaveTextContent('login.continue_with_google');
    expect(serverSlots[1]).toHaveTextContent('login.continue_with_passkey');

    localStorage.setItem('tuturuuu:last-login-method', 'azure');
    await act(async () => {
      hydrateRoot(container, element);
    });

    const clientSlots = slots(container);
    expect(clientSlots).toHaveLength(2);
    clientSlots.forEach((slot, index) => {
      expect(slot).toBe(serverSlots[index]);
    });
    expect(container.querySelectorAll('button')).toHaveLength(serverButtons);
    expect(clientSlots[0]).toHaveTextContent('login.staff_microsoft');
    expect(clientSlots[0]).toHaveTextContent('login.last_used');
    expect(clientSlots[1]).toHaveTextContent('login.continue_with_google');
    expect(container).not.toHaveTextContent('login.microsoft_email_recovery');
  });
});
