import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CountBadge } from './control-button';

it('renders nothing for a zero or negative count', () => {
  expect(renderToStaticMarkup(<CountBadge count={0} />)).toBe('');
  expect(renderToStaticMarkup(<CountBadge count={-2} />)).toBe('');
});

it('uses the paired primary tokens so it keeps contrast in both themes', () => {
  const html = renderToStaticMarkup(<CountBadge count={3} />);
  expect(html).toContain('bg-primary');
  expect(html).toContain('text-primary-foreground');
  expect(html).not.toContain('text-white');
  expect(html).not.toContain('bg-dynamic-blue');
});

it('pins to the corner on a round control and caps the count', () => {
  const html = renderToStaticMarkup(<CountBadge count={12} />);
  expect(html).toContain('absolute');
  expect(html).toContain('9+');
});

it('sits inline at the end of a menu row', () => {
  const html = renderToStaticMarkup(<CountBadge count={2} inline />);
  expect(html).toContain('ml-auto');
  expect(html).not.toContain('absolute');
});
