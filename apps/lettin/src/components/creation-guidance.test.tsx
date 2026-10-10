// @vitest-environment jsdom
import type { LettinCreationGuidance } from '@tuturuuu/internal-api/lettin';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CreationGuidance } from './creation-guidance';
import { CreationGuidanceEditor } from './creation-guidance-editor';
import { DocumentView } from './document-view';
import { createStarterDraft } from './starter-drafts';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const guidance: LettinCreationGuidance = {
  credits: '<script>Artist</script>',
  usageNotes: '<img src=x onerror=alert(1)>',
  collaboration: 'ask-first',
};
it('keeps legacy and empty guidance invisible without claiming a preference', () => {
  expect(renderToStaticMarkup(<CreationGuidance />)).toBe('');
  expect(
    renderToStaticMarkup(
      <CreationGuidance
        value={{ credits: '  ', usageNotes: '', collaboration: 'unspecified' }}
      />
    )
  ).toBe('');
});
it('escapes creator text and shows preferences as advisory information without actions or grants', () => {
  const html = renderToStaticMarkup(<CreationGuidance value={guidance} />);
  expect(html).toContain('&lt;script&gt;Artist&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('creationCollaboration_ask-first');
  expect(html).toContain('creationGuidanceAdvisory');
  expect(html).not.toContain('<a');
  expect(html).not.toContain('<button');
});
it('renders document guidance without moving content notices after artwork', () => {
  const html = renderToStaticMarkup(
    <DocumentView
      draft={{
        ...createStarterDraft('Creation', 'blank', (key) => key),
        image: 'https://example.com/art.png',
        creationGuidance: guidance,
        contentNotice: 'Notice',
      }}
    />
  );
  expect(html).toContain('creationGuidanceAdvisory');
  expect(html.indexOf('contentNotice')).toBeLessThan(html.indexOf('<img'));
});
it('edits only the explicit draft value, preserves other guidance fields and supports clearing', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState<LettinCreationGuidance | undefined>(
      undefined
    );
    return (
      <CreationGuidanceEditor
        value={value}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(() => root.render(<Harness />));
    expect(changed).not.toHaveBeenCalled();
    const fields = container.querySelectorAll('textarea');
    expect(fields[0]!.maxLength).toBe(1000);
    async function edit(field: HTMLTextAreaElement, value: string) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )!.set!;
      await act(() => {
        setter.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await edit(fields[0]!, 'Artist');
    await edit(fields[1]!, 'Ask first');
    const select = container.querySelector('select')!;
    await act(() => {
      select.value = 'closed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(changed).toHaveBeenLastCalledWith({
      credits: 'Artist',
      usageNotes: 'Ask first',
      collaboration: 'closed',
    });
    await edit(fields[0]!, '');
    expect(changed).toHaveBeenLastCalledWith({
      credits: '',
      usageNotes: 'Ask first',
      collaboration: 'closed',
    });
  } finally {
    await act(() => root.unmount());
  }
});
