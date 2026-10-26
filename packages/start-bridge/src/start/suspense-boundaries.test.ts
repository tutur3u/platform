import { createElement as h, lazy, type ReactNode, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { describe, expect, it } from 'vitest';
import { findUnresolvedSuspenseBoundaries } from './suspense-boundaries';

const later = (node: ReactNode, ms = 10) =>
  h(
    lazy(
      () =>
        new Promise<{ default: () => ReactNode }>((resolve) =>
          setTimeout(() => resolve({ default: () => node }), ms)
        )
    )
  );

const render = async (
  body: ReactNode,
  options: Parameters<typeof renderToReadableStream>[1] = {}
) =>
  new Response(
    await renderToReadableStream(h('html', null, h('body', null, body)), {
      onError: () => {},
      ...options,
    })
  ).text();

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

  it('accepts streamed boundaries completed in div, svg and table segments', async () => {
    const html = await render([
      h(Suspense, { key: 'div', fallback: h('i', null, '…') }, later('in')),
      h(
        'svg',
        { key: 'svg' },
        h(Suspense, { fallback: h('g') }, later(h('circle', { r: 1 })))
      ),
      h(
        'table',
        { key: 'table' },
        h(
          'tbody',
          null,
          h(
            Suspense,
            { fallback: h('tr') },
            later(h('tr', null, h('td', null, 'row')))
          )
        )
      ),
    ]);

    expect(html).toContain(
      '<svg aria-hidden="true" style="display:none" id="S:'
    );
    expect(html).toContain('<table hidden><tbody id="S:');
    expect(findUnresolvedSuspenseBoundaries(html)).toEqual([]);
  });

  it('reads identifierPrefix ids instead of passing silently', async () => {
    const resolved = await render(
      h(Suspense, { fallback: h('i', null, '…') }, later('in')),
      { identifierPrefix: 'r' }
    );
    expect(resolved).toContain('<template id="rB:0">');
    expect(findUnresolvedSuspenseBoundaries(resolved)).toEqual([]);

    const truncated = resolved.slice(
      0,
      resolved.indexOf('<div hidden id="rS:0"')
    );
    expect(findUnresolvedSuspenseBoundaries(truncated)).toEqual(['rB:0']);
  });

  it('reads the external-runtime attribute instructions', () => {
    // Experimental React builds emit these instead of inline scripts.
    const html = [
      '<!--$?--><template id="B:0"></template><template id="P:1"></template><!--/$-->',
      '<!--$?--><template id="B:2"></template><!--/$-->',
      '<!--$?--><template id="B:3"></template><!--/$-->',
      '<div hidden id="S:1">fallback</div><template data-rsi="" data-sid="S:1" data-pid="P:1"></template>',
      '<div hidden id="S:0">in</div><template data-rci="" data-bid="B:0" data-sid="S:0"></template>',
      '<div hidden id="S:2">in</div><template data-rri="" data-bid="B:2" data-sid="S:2" data-sty="[]"></template>',
      '<template data-rxi="" data-bid="B:3" data-dgst="x"></template>',
    ].join('');

    expect(findUnresolvedSuspenseBoundaries(html)).toEqual(['B:3']);
  });

  it('reports boundaries the shell switched to client rendering', async () => {
    const Broken = () => {
      throw new Error('render failed');
    };
    const html = await render(
      h(Suspense, { fallback: h('i', null, '…') }, h(Broken))
    );

    expect(findUnresolvedSuspenseBoundaries(html)).toEqual(['<!--$!-->#0']);
  });
});
