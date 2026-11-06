import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FormsMarkdown } from './forms-markdown';

describe('FormsMarkdown', () => {
  it('sanitizes rich HTML during server rendering without crashing', () => {
    const html = renderToString(
      <FormsMarkdown
        content={
          '<p>Hello <strong>friend</strong></p><script>alert(1)</script><a href="javascript:alert(2)">bad link</a>'
        }
      />
    );

    expect(html).toContain('Hello');
    expect(html).toContain('<strong>friend</strong>');
    expect(html).toContain('bad link');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });

  it('hydrates server-sanitized rich HTML without a mismatch', async () => {
    const element = (
      <FormsMarkdown content='<h1 data-step="1">Title</h1><p><a href="sms:1" aria-label="text">t</a></p><svg><p>x</p></svg><img src="data:image/png;base64,AA" onerror="alert(1)">' />
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const serverHtml = container.innerHTML;
    const recoverable: unknown[] = [];
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const reactActEnvironment = globalThis as {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

    try {
      const root = await act(async () =>
        hydrateRoot(container, element, {
          onRecoverableError: (error) => recoverable.push(error),
        })
      );
      expect(recoverable).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      expect(container.innerHTML).toBe(serverHtml);
      expect(container.querySelector('h1')?.dataset.step).toBe('1');
      expect(container.querySelector('svg, [onerror]')).toBeNull();
      act(() => root.unmount());
    } finally {
      reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      consoleError.mockRestore();
      container.remove();
    }
  });
});
