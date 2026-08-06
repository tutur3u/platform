import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageText } from './message-links';

describe('MessageText', () => {
  it('renders HTML-like message content as inert text', () => {
    const { container } = render(
      <MessageText content="<img src=x onerror=alert(1)>" />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
