// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { shouldPreserveNativeContextMenu } from './utils';

describe('shouldPreserveNativeContextMenu', () => {
  it('preserves the native context menu inside the rich text editor', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'ProseMirror';

    const paragraph = document.createElement('p');
    const text = document.createTextNode('Task description');

    paragraph.appendChild(text);
    wrapper.appendChild(paragraph);
    document.body.appendChild(wrapper);

    expect(shouldPreserveNativeContextMenu(text)).toBe(true);
  });

  it('preserves the native context menu for form inputs', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    expect(shouldPreserveNativeContextMenu(input)).toBe(true);
  });

  it('continues suppressing the dialog context menu on non-editable surfaces', () => {
    const container = document.createElement('div');
    const button = document.createElement('button');

    container.appendChild(button);
    document.body.appendChild(container);

    expect(shouldPreserveNativeContextMenu(button)).toBe(false);
  });
});
