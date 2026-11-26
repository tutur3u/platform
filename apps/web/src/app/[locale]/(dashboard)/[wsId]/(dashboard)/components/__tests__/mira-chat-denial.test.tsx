// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '@/../messages/en.json';
import viMessages from '@/../messages/vi.json';
import {
  MIRA_PERMISSIONS_LEARN_MORE_URL,
  MIRA_PRICING_LEARN_MORE_URL,
  MiraChatRequestError,
  parseMiraChatDenial,
  restoreMiraPromptInput,
} from '../mira-chat-denial';
import { MiraChatDenialBanner } from '../mira-chat-denial-banner';

vi.mock('@/lib/pay-app-url', () => ({
  getPayBillingUrl: (wsId: string) => `https://pay.test/${wsId}/billing`,
}));

let activeLocale: 'en' | 'vi' = 'en';

function lookupKey(source: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object' && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
  if (typeof value !== 'string') {
    throw new Error(`Missing translation key: ${path}`);
  }
  return value;
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const bundle = activeLocale === 'vi' ? viMessages : enMessages;
    return lookupKey(
      bundle as unknown as Record<string, unknown>,
      `${namespace}.${key}`
    );
  },
}));

describe('mira-chat-denial helpers', () => {
  it.each([
    [
      new MiraChatRequestError({ code: 'MODEL_NOT_ALLOWED', status: 403 }),
      'plan',
    ],
    [
      new MiraChatRequestError({ code: 'FEATURE_NOT_ALLOWED', status: 403 }),
      'plan',
    ],
    [
      new MiraChatRequestError({ code: 'CREDITS_EXHAUSTED', status: 403 }),
      'credits',
    ],
    [
      new MiraChatRequestError({ code: 'DAILY_LIMIT_REACHED', status: 403 }),
      'daily_limit',
    ],
    [
      new MiraChatRequestError({
        serverMessage: 'Workspace access denied',
        status: 403,
      }),
      'permission',
    ],
    [
      new Error(
        JSON.stringify({
          code: 'CREDITS_EXHAUSTED',
          error: 'AI credits have been used up',
        })
      ),
      'credits',
    ],
  ] as const)('classifies denial %o as %s', (error, expectedKind) => {
    expect(parseMiraChatDenial(error)?.kind).toBe(expectedKind);
  });

  it('ignores non-denial errors', () => {
    expect(
      parseMiraChatDenial(
        new MiraChatRequestError({ serverMessage: 'Server down', status: 500 })
      )
    ).toBeNull();
    expect(parseMiraChatDenial(new Error('Network error'))).toBeNull();
  });

  it('preserves user prompt text without losing or duplicating drafts', () => {
    expect(restoreMiraPromptInput('', 'My prompt')).toBe('My prompt');
    expect(restoreMiraPromptInput('My prompt', 'My prompt')).toBe('My prompt');
    expect(restoreMiraPromptInput('extra text', 'My prompt')).toBe(
      'My prompt\nextra text'
    );
  });
});

describe('MiraChatDenialBanner', () => {
  it.each(['en', 'vi'] as const)(
    'shows localized credits denial with Upgrade and Learn more (%s)',
    (locale) => {
      activeLocale = locale;
      const onDismiss = vi.fn();
      const { unmount } = render(
        <MiraChatDenialBanner
          billingWsId="ws-personal-1"
          denial={{ code: 'CREDITS_EXHAUSTED', kind: 'credits', status: 403 }}
          onDismiss={onDismiss}
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeTruthy();
      expect(alert.getAttribute('data-denial-kind')).toBe('credits');

      const bundle = locale === 'vi' ? viMessages : enMessages;
      const expected = bundle.dashboard.mira_chat.request_denied;
      expect(screen.getByText(expected.credits.title)).toBeTruthy();
      expect(screen.getByText(expected.credits.description)).toBeTruthy();

      const upgradeLink = screen.getByRole('link', { name: expected.upgrade });
      expect(upgradeLink.getAttribute('href')).toBe(
        'https://pay.test/ws-personal-1/billing'
      );
      const learnMoreLink = screen.getByRole('link', {
        name: expected.learn_more,
      });
      expect(learnMoreLink.getAttribute('href')).toBe(
        MIRA_PRICING_LEARN_MORE_URL
      );

      fireEvent.click(screen.getByRole('button', { name: expected.dismiss }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      unmount();
    }
  );

  it('shows Learn more without Upgrade for permission denials', () => {
    activeLocale = 'en';
    const { unmount } = render(
      <MiraChatDenialBanner
        billingWsId="ws-personal-1"
        denial={{ kind: 'permission', status: 403 }}
        onDismiss={vi.fn()}
      />
    );

    const expected = enMessages.dashboard.mira_chat.request_denied;
    expect(screen.getByText(expected.permission.title)).toBeTruthy();
    expect(screen.queryByRole('link', { name: expected.upgrade })).toBeNull();
    const learnMoreLink = screen.getByRole('link', {
      name: expected.learn_more,
    });
    expect(learnMoreLink.getAttribute('href')).toBe(
      MIRA_PERMISSIONS_LEARN_MORE_URL
    );
    unmount();
  });
});
