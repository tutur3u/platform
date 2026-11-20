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

it('hides the switch when the server found no Teach access', () => {
  renderSwitch(null, 'en');
  expect(screen.queryByRole('link')).toBeNull();
});

it('links a dual-role learner to the Vietnamese Teach home', () => {
  expect(vi.navigation.switchToTeach).toBe('Giảng dạy');
  renderSwitch('/lms/teach/vi/dashboard', 'vi');
  expect(
    screen
      .getByRole('link', { name: vi.navigation.switchToTeach })
      .getAttribute('href')
  ).toBe('/lms/teach/vi/dashboard');
});

it('links a dual-role learner to the English Teach home', () => {
  expect(en.navigation.switchToTeach).toBe('Teach');
  renderSwitch('/lms/teach/en/dashboard', 'en');
  expect(
    screen
      .getByRole('link', { name: en.navigation.switchToTeach })
      .getAttribute('href')
  ).toBe('/lms/teach/en/dashboard');
});
