import { describe, expect, it } from 'vitest';
import { getChatMessageDisplayContent } from './external-message-content';

describe('getChatMessageDisplayContent', () => {
  it('decodes named and numeric entities for external chat messages', () => {
    expect(
      getChatMessageDisplayContent({
        content:
          'T&ocirc;i &#273;&atilde; g&#7917;i tin &amp; ch&#7901; ph&#7843;n h&#7891;i.',
        metadata: { externalChat: true },
      })
    ).toBe('Tôi đã gửi tin & chờ phản hồi.');
  });

  it('leaves native chat content unchanged', () => {
    expect(
      getChatMessageDisplayContent({
        content: 'Keep &amp; exactly as authored',
        metadata: {},
      })
    ).toBe('Keep &amp; exactly as authored');
  });

  it('returns decoded markup as text content rather than an HTML contract', () => {
    expect(
      getChatMessageDisplayContent({
        content: '&lt;img src=x onerror=alert(1)&gt;',
        metadata: { externalChat: true },
      })
    ).toBe('<img src=x onerror=alert(1)>');
  });
});
