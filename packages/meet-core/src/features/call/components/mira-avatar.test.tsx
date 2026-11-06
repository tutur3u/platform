// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraAvatar } from './mira-profile';

vi.mock('./live-avatar', () => ({
  LiveAvatar: () => <span data-testid="live-avatar" />,
}));

afterEach(cleanup);

function images(container: HTMLElement) {
  return Array.from(container.querySelectorAll('img'));
}

it('renders the theme-aware Mira mark as plain images', () => {
  const { container } = render(<MiraAvatar size={18} />);
  const [light, dark] = images(container);
  expect(images(container)).toHaveLength(2);
  expect(light?.getAttribute('src')).toBe('/media/logos/mira-light.png');
  expect(light?.className).toContain('dark:hidden');
  expect(dark?.getAttribute('src')).toBe('/media/logos/mira-dark.png');
  expect(dark?.className).toContain('hidden dark:block');
  for (const image of [light, dark]) {
    expect(image?.getAttribute('width')).toBe('18');
    expect(image?.getAttribute('src')).not.toContain('/_next/image');
  }
  expect(screen.queryByTestId('mira-avatar-fallback')).toBeNull();
});

it('swaps to an icon when the image fails to load', () => {
  const { container } = render(<MiraAvatar size={18} />);
  fireEvent.error(images(container)[0]!);
  expect(images(container)).toHaveLength(0);
  const fallback = screen.getByTestId('mira-avatar-fallback');
  expect(fallback.tagName.toLowerCase()).toBe('svg');
  expect(fallback.getAttribute('aria-hidden')).toBe('true');
  expect(fallback.style.width).toBe('18px');
});
