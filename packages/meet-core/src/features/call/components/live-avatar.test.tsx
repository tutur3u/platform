import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { LiveAvatar } from './live-avatar';

it('keeps its intrinsic size by default', () => {
  const html = renderToStaticMarkup(<LiveAvatar size={120} />);
  expect(html).toContain('width="120"');
  expect(html).toContain('text-primary');
});

it('accepts a class that constrains it to its area', () => {
  const html = renderToStaticMarkup(
    <LiveAvatar
      className="size-[clamp(1.5rem,calc(100cqh-0.5rem),7.5rem)]"
      size={120}
    />
  );
  expect(html).toContain('size-[clamp(1.5rem,calc(100cqh-0.5rem),7.5rem)]');
  expect(html).toContain('shrink-0');
});
