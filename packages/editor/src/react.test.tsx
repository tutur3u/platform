// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from './react.js';

afterEach(cleanup);

describe('RichTextEditor WYSIWYG', () => {
  it('keeps the formatted document editable without a legacy preview switch', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        content={{
          content: [
            {
              content: [{ text: 'Preview this article', type: 'text' }],
              type: 'paragraph',
            },
            {
              attrs: {
                alt: 'Article detail',
                src: 'https://example.com/article-detail.png',
              },
              type: 'image',
            },
          ],
          type: 'doc',
        }}
        enablePreview
        featurePreset="full"
        onChange={onChange}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('.tiptap')?.textContent).toBe(
        'Preview this article'
      );
      expect(
        container.querySelector('.tiptap')?.getAttribute('contenteditable')
      ).toBe('true');
    });
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Heading 1' })
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Article detail' }).getAttribute('src')
    ).toBe('https://example.com/article-detail.png');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never exposes source or preview modes, even for legacy props', async () => {
    const onSourceModeDirtyChange = vi.fn();
    render(
      <RichTextEditor
        content={null}
        enableHTMLSource
        enablePreview
        featurePreset="full"
        onSourceModeDirtyChange={onSourceModeDirtyChange}
      />
    );
    expect(await screen.findByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'HTML' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(onSourceModeDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps read-only editors free of authoring controls', async () => {
    render(
      <RichTextEditor
        content={null}
        enableHTMLSource
        featurePreset="full"
        readOnly
      />
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'HTML' })).toBeNull()
    );
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
  });

  it('updates visual editing when read-only changes', async () => {
    const { container, rerender } = render(
      <RichTextEditor
        content={{
          content: [
            {
              content: [{ text: 'Live content', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        }}
        featurePreset="full"
      />
    );
    let editable: Element | null = null;
    await waitFor(() => {
      editable = container.querySelector('.tiptap');
      expect(editable?.getAttribute('contenteditable')).toBe('true');
    });

    rerender(
      <RichTextEditor
        content={{
          content: [
            {
              content: [{ text: 'Live content', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        }}
        featurePreset="full"
        readOnly
      />
    );

    await waitFor(() => {
      const current = container.querySelector('.tiptap');
      expect(current).toBe(editable);
      expect(current?.getAttribute('contenteditable')).toBe('false');
      expect(current?.textContent).toBe('Live content');
    });
  });

  it('adds collapsible sections as visible structured content', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor content={null} featurePreset="full" onChange={onChange} />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Toggle section' })
    );
    await waitFor(() => {
      expect(container.querySelector('details[open]')).toBeTruthy();
      expect(container.querySelector('summary')?.textContent).toBe(
        'Section title'
      );
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'collapsible' }),
          ]),
        })
      );
    });
  });

  it('renders product actions inside the formatting toolbar', async () => {
    render(
      <RichTextEditor
        content={null}
        featurePreset="full"
        toolbarEnd={<button type="button">Expand editor</button>}
      />
    );
    const toolbar = await screen.findByRole('toolbar', { name: 'Formatting' });
    expect(
      toolbar.querySelector('button[aria-label="Expand editor"]') ??
        screen.getByRole('button', { name: 'Expand editor' })
    ).toBeTruthy();
  });

  it('rebuilds its schema when the feature preset changes', async () => {
    const { rerender } = render(
      <RichTextEditor content={null} featurePreset="compact" />
    );
    expect(
      await screen.findByRole('button', { name: 'Underline' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Heading 2' })).toBeNull();

    rerender(<RichTextEditor content={null} featurePreset="full" />);
    expect(
      await screen.findByRole('button', { name: 'Heading 1' })
    ).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Heading 2' })
    ).toBeTruthy();
  });

  it('updates the live placeholder when its prop changes', async () => {
    const { container, rerender } = render(
      <RichTextEditor content={null} placeholder="First prompt" />
    );
    await waitFor(() =>
      expect(
        container
          .querySelector('[data-placeholder]')
          ?.getAttribute('data-placeholder')
      ).toBe('First prompt')
    );

    rerender(<RichTextEditor content={null} placeholder="Second prompt" />);
    await waitFor(() =>
      expect(
        container
          .querySelector('[data-placeholder]')
          ?.getAttribute('data-placeholder')
      ).toBe('Second prompt')
    );
  });

  it('supports keyboard navigation and Escape in style menus', async () => {
    render(
      <RichTextEditor
        content={null}
        featurePreset="compact"
        stylePolicy={{
          textTones: [
            { label: 'Gold', value: '#aa7700' },
            { label: 'Duplicate gold', value: '#aa7700' },
            { label: 'Ink', value: '#111111' },
          ],
        }}
      />
    );
    const trigger = await screen.findByRole('button', { name: 'Text tone' });
    fireEvent.click(trigger);
    const gold = screen.getByRole('menuitemradio', { name: 'Gold' });
    await waitFor(() => expect(document.activeElement).toBe(gold));
    expect(
      screen.queryByRole('menuitemradio', { name: 'Duplicate gold' })
    ).toBeNull();

    fireEvent.keyDown(gold, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitemradio', { name: 'Ink' })
    );
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await screen.findByRole('menu');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
