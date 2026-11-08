// @vitest-environment node

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EventDescription from './event-description';

describe('calendar EventDescription server rendering', () => {
  it('renders actual plain descriptions without a browser DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const output = renderToStaticMarkup(
      <EventDescription description={'Budget < 10 & notes\nNext line'} />
    );
    expect(output).toContain('Budget &lt; 10 &amp; notes\nNext line');
    expect(output).toContain('whitespace-pre-wrap');
  });

  it.each([
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '<a href="javascript:alert(1)">unsafe link</a>',
    '<strong>literal markup</strong>',
  ])('renders supplied markup as escaped text: %s', (description) => {
    const output = renderToStaticMarkup(
      <EventDescription description={description} />
    );
    expect(output).toContain('&lt;');
    expect(output).not.toContain('<img');
    expect(output).not.toContain('<script');
    expect(output).not.toContain('<a ');
    expect(output).not.toContain('<strong');
  });

  it('omits an empty description', () => {
    expect(renderToStaticMarkup(<EventDescription description="" />)).toBe('');
  });
});
