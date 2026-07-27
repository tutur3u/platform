import { describe, expect, it } from 'vitest';
import { editorMessages } from './messages.js';

describe('editor messages', () => {
  it('names every supported heading level in both locales', () => {
    expect(editorMessages.en).toMatchObject({
      heading1: 'Heading 1',
      heading2: 'Heading 2',
      heading3: 'Heading 3',
    });
    expect(editorMessages.vi).toMatchObject({
      heading1: 'Tiêu đề cấp 1',
      heading2: 'Tiêu đề cấp 2',
      heading3: 'Tiêu đề cấp 3',
    });
  });
});
