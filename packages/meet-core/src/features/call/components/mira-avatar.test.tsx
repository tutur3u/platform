// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraAvatar } from './mira-profile';

vi.mock('./live-avatar', () => ({
  LiveAvatar: () => <span data-testid="live-avatar" />,
}));

afterEach(cleanup);

it('renders the Mira mark inline, without any network asset', () => {
  const { container } = render(<MiraAvatar size={18} />);
  const mark = screen.getByTestId('mira-mark');
  expect(mark.tagName.toLowerCase()).toBe('svg');
  expect(mark.getAttribute('width')).toBe('18');
  expect(mark.getAttribute('height')).toBe('18');
  expect(mark.getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelector('img')).toBeNull();
  expect(container.innerHTML).not.toMatch(/\/media\/|\/_next\/image|url\(/u);
  // The tile follows the theme token; the four strokes keep brand colors.
  expect(mark.querySelector('rect')?.getAttribute('class')).toContain(
    'fill-muted'
  );
  expect(mark.querySelectorAll('path')).toHaveLength(4);
});
