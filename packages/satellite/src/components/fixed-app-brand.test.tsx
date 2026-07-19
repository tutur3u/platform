import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

describe('FixedAppBrand', () => {
  it('keeps platform and app destinations distinct', () => {
    render(
      <FixedAppBrand
        appHref="/internal"
        appName="Infrastructure"
        centralHref="https://tuturuuu.example"
      />
    );

    expect(
      screen.getByRole('link', { name: 'Tuturuuu' }).getAttribute('href')
    ).toBe('https://tuturuuu.example');
    expect(
      screen.getByRole('link', { name: 'Infrastructure' }).getAttribute('href')
    ).toBe('/internal');
  });

  it('reserves trailing space for app-specific controls', () => {
    render(
      <FixedAppBrand
        actions={<button type="button">Create chat</button>}
        appHref="/internal"
        appName="Chat"
        centralHref="https://tuturuuu.example"
      />
    );

    expect(screen.getByRole('button', { name: 'Create chat' })).toBeTruthy();
  });

  it('turns the app name into a launcher trigger with a chevron', () => {
    const onAppClick = vi.fn();

    render(
      <FixedAppBrand
        appHref="/internal"
        appName="Infrastructure"
        centralHref="https://tuturuuu.example"
        launcherLabel="Open apps"
        onAppClick={onAppClick}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open apps' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.querySelector('svg')).toBeTruthy();

    fireEvent.click(trigger);
    expect(onAppClick).toHaveBeenCalledOnce();
  });
});
