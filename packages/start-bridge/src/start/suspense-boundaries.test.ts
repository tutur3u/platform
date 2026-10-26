import { createElement as h, lazy, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { describe, expect, it } from 'vitest';
import { findUnresolvedSuspenseBoundaries } from './suspense-boundaries';

const later = <T>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('findUnresolvedSuspenseBoundaries', () => {
  it('flags a pending boundary, a completion without its segment and an unfilled segment', () => {
    const html = [
      '<!--$?--><template id="B:2c"></template><template id="P:2d"></template><!--/$-->',
      '<!--$?--><template id="B:41"></template><template id="P:42"></template><!--/$-->',
      '<!--$?--><template id="B:5"></template><!--/$-->',
      '<div hidden id="S:2d">fallback</div><script>$RS("S:2d","P:2d")</script>',
      '<script>$RC("B:41","S:41")</script>',
      '<script>$RX("B:5","","")</script>',
    ].join('');

    expect(findUnresolvedSuspenseBoundaries(html)).toEqual([
      'B:2c',
      'B:41',
      'P:42',
      'B:5',
    ]);
  });

  it('accepts a streamed response whose boundaries all resolve', async () => {
    const Late = lazy(() =>
      later({ default: () => h('a', { href: '/dashboard' }, 'in') }, 10)
    );
    const stream = await renderToReadableStream(
      h(
        'html',
        null,
        h(
          'body',
          null,
          h(Suspense, { fallback: h('i', null, 'loading') }, h(Late))
        )
      )
    );
    const html = await new Response(stream).text();

    expect(html).toContain('<template id="B:0">');
    expect(findUnresolvedSuspenseBoundaries(html)).toEqual([]);
  });
});
