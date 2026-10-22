import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { GATEWAY_APPS } from '../lib/apps-registry';
import { AppsGatewayPage } from './gateway-page';

describe('native production catalogue interaction', () => {
  it.each([
    { locale: 'en', messages: en },
    { locale: 'vi', messages: vi },
  ])('renders and searches all apps in $locale', ({ locale, messages }) => {
    const view = render(
      <IntlProvider locale={locale} messages={messages}>
        <AppsGatewayPage />
      </IntlProvider>
    );
    for (const app of GATEWAY_APPS)
      expect(
        view.container.querySelector(`a[href="/${app.slug}"]`)
      ).not.toBeNull();
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'no-existing-app-fixture' } });
    expect(
      screen.getByText(messages.command_launcher.no_apps_found)
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.appsGateway.catalog.clearSearch,
      })
    );
    expect(view.container.querySelector('a[href="/meet"]')).not.toBeNull();
    view.unmount();
  });
});
