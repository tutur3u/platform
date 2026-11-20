import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { LmsAreaSwitchLink } from './lms-area-switch';

afterEach(cleanup);

function renderSwitch(href: string | null, locale: 'en' | 'vi') {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'vi' ? vi : en}
      timeZone="UTC"
    >
      <LmsAreaSwitchLink href={href} />
    </NextIntlClientProvider>
  );
}

it('hides the switch when the server found no Learn access', () => {
  renderSwitch(null, 'en');
  expect(screen.queryByRole('link')).toBeNull();
});

it('links a dual-role teacher to the Vietnamese Learn home', () => {
  expect(vi.teachShell.switchToLearn).toBe('Học tập');
  renderSwitch('/lms/learn/vi/dashboard', 'vi');
  expect(
    screen
      .getByRole('link', { name: vi.teachShell.switchToLearn })
      .getAttribute('href')
  ).toBe('/lms/learn/vi/dashboard');
});

it('links a dual-role teacher to the English Learn home', () => {
  expect(en.teachShell.switchToLearn).toBe('Learn');
  renderSwitch('/lms/learn/en/dashboard', 'en');
  expect(
    screen
      .getByRole('link', { name: en.teachShell.switchToLearn })
      .getAttribute('href')
  ).toBe('/lms/learn/en/dashboard');
});
