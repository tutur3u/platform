// @vitest-environment jsdom

import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RichEditor } from './rich-editor';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock(
  '../../../../packages/ui/src/components/ui/text-editor/tool-bar',
  () => ({
    FixedToolbar: () => null,
    ToolBar: () => null,
  })
);
vi.mock(
  '../../../../packages/ui/src/components/ui/text-editor/task-item-checkbox',
  async (original) => ({
    ...(await original<Record<string, unknown>>()),
    useMentionedTaskStatuses: () => ({ data: [] }),
  })
);

it('initializes the real editor and applies Markdown to the current draft', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let current: LettinNode | undefined;
  function Draft() {
    const [value, setValue] = useState<LettinNode>({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    return (
      <RichEditor
        value={value}
        onChange={(next) => {
          current = next;
          setValue(next);
        }}
      />
    );
  }
  try {
    await act(async () => root.render(<Draft />));
    await vi.waitFor(() =>
      expect(
        container.querySelector<HTMLButtonElement>('button')?.disabled
      ).toBe(false)
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button')!.click()
    );
    const textarea = container.querySelector('textarea')!;
    expect(textarea).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )!.set!.call(textarea, '# Synthetic chapter\n\n**A memorable opening.**');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button')!.click()
    );
    expect(container.querySelector('textarea')).toBeNull();
    expect(JSON.stringify(current)).toContain('A memorable opening.');
    expect(container.querySelector('strong')?.textContent).toBe(
      'A memorable opening.'
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
