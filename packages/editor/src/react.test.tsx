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

describe('RichTextEditor WYSIWYG and source modes', () => {
  it('preserves unapplied source and discards it explicitly', async () => {
    const onChange = vi.fn();
    const onSourceModeDirtyChange = vi.fn();
    render(
      <RichTextEditor
        content={{
          content: [
            {
              content: [{ text: 'Original', type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        }}
        enableHTMLSource
        enablePreview
        featurePreset="full"
        onChange={onChange}
        onSourceModeDirtyChange={onSourceModeDirtyChange}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'HTML' }));
    const source = screen.getByRole('textbox', { name: 'HTML source' });
    fireEvent.change(source, { target: { value: '<p>Changed</p>' } });
    await waitFor(() =>
      expect(onSourceModeDirtyChange).toHaveBeenLastCalledWith(true)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));

    expect((source as HTMLTextAreaElement).value).toBe('<p>Changed</p>');
    expect(screen.getByRole('alert').textContent).toContain(
      'Apply or discard your HTML changes'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('textbox', { name: 'HTML source' })).toBeNull();
    await waitFor(() =>
      expect(onSourceModeDirtyChange).toHaveBeenLastCalledWith(false)
    );
    expect(onChange).not.toHaveBeenCalled();
  });

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

  it('applies safe HTML as structured JSON and blocks unsafe source', async () => {
    const onChange = vi.fn();
    render(
      <RichTextEditor
        content={null}
        enableHTMLSource
        featurePreset="full"
        onChange={onChange}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'HTML' }));
    const source = screen.getByRole('textbox', { name: 'HTML source' });
    fireEvent.change(source, { target: { value: '<p><u>Safe</u></p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply HTML' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'doc' })
      )
    );
    await waitFor(() =>
      expect((source as HTMLTextAreaElement).value).toContain('Safe')
    );

    fireEvent.change(source, {
      target: { value: '<script>alert(1)</script>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply HTML' }));
    expect(screen.getByRole('alert').textContent).toContain(
      'contains unsafe or unsupported code'
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps read-only editors free of HTML controls', async () => {
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

  it('refreshes a clean HTML projection when controlled content changes', async () => {
    const first = {
      content: [
        {
          content: [{ text: 'First', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };
    const second = {
      content: [
        {
          content: [{ text: 'Second', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };
    const { rerender } = render(
      <RichTextEditor content={first} enableHTMLSource featurePreset="full" />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'HTML' }));
    expect(
      (
        screen.getByRole('textbox', {
          name: 'HTML source',
        }) as HTMLTextAreaElement
      ).value
    ).toContain('First');

    rerender(
      <RichTextEditor content={second} enableHTMLSource featurePreset="full" />
    );

    await waitFor(() =>
      expect(
        (
          screen.getByRole('textbox', {
            name: 'HTML source',
          }) as HTMLTextAreaElement
        ).value
      ).toContain('Second')
    );
  });

  it('exits source mode when source editing becomes unavailable', async () => {
    const { rerender } = render(
      <RichTextEditor content={null} enableHTMLSource featurePreset="full" />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'HTML' }));
    expect(screen.getByRole('textbox', { name: 'HTML source' })).toBeTruthy();

    rerender(
      <RichTextEditor
        content={null}
        enableHTMLSource={false}
        featurePreset="full"
      />
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'HTML source' })).toBeNull()
    );
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
