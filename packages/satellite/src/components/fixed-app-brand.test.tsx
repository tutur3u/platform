import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedAppBrand } from './fixed-app-brand';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TuturuuLogo: (props: ComponentProps<'img'>) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt="" {...props} />
  ),
}));

afterEach(cleanup);

describe('FixedAppBrand', () => {
  function renderBrand(
    props: ComponentProps<typeof FixedAppBrand>,
    appNames = { chat: 'Chat', infrastructure: 'Infrastructure' }
  ) {
    return render(
      <NextIntlClientProvider
        locale="en"
        messages={{ command_launcher: { app_names: appNames } }}
      >
        <FixedAppBrand {...props} />
      </NextIntlClientProvider>
    );
  }

  it('keeps platform and app destinations distinct', () => {
    renderBrand({
      appHref: '/internal',
      appId: 'infrastructure',
      centralHref: 'https://tuturuuu.example',
    });

    expect(
      screen.getByRole('link', { name: 'Tuturuuu' }).getAttribute('href')
    ).toBe('https://tuturuuu.example');
    expect(
      screen.getByRole('link', { name: 'Infrastructure' }).getAttribute('href')
    ).toBe('/internal');
  });

  it('reserves trailing space for app-specific controls', () => {
    renderBrand({
      actions: <button type="button">Create chat</button>,
      appHref: '/internal',
      appId: 'chat',
      centralHref: 'https://tuturuuu.example',
    });

    expect(screen.getByRole('button', { name: 'Create chat' })).toBeTruthy();
  });

  it('turns the app name into a launcher trigger with a chevron', () => {
    const onAppClick = vi.fn();

    renderBrand({
      appHref: '/internal',
      appId: 'infrastructure',
      centralHref: 'https://tuturuuu.example',
      launcherLabel: 'Open apps',
      onAppClick,
    });

    const trigger = screen.getByRole('button', { name: 'Open apps' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.querySelector('svg')).toBeTruthy();
    expect(trigger.querySelector('svg')?.className.baseVal).not.toContain(
      'group-hover:translate-y-0.5'
    );

    fireEvent.click(trigger);
    expect(onAppClick).toHaveBeenCalledOnce();
  });

  it('uses the localized app name from the shared launcher catalog', () => {
    renderBrand(
      {
        appHref: '/internal',
        appId: 'infrastructure',
        centralHref: 'https://tuturuuu.example',
      },
      { chat: 'Trò chuyện', infrastructure: 'Hạ tầng' }
    );

    expect(screen.getByRole('link', { name: 'Hạ tầng' })).toBeTruthy();
    expect(screen.queryByText('Infrastructure')).toBeNull();
  });
});
