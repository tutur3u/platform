// @vitest-environment jsdom
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EntryEditor } from './entry-editor';

const { mutateAsync, preview, uploadArtwork } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  uploadArtwork: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('./publication-preview', () => ({
  PublicationPreview: (props: unknown) => {
    preview(props);
    return null;
  },
}));
vi.mock('./use-lettin', () => ({
  useLettinMutation: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false }),
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  uploadLettinArtwork: uploadArtwork,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count: number }) =>
    key === 'writingCount' ? String(values?.count) : key,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => {
    void _variant;
    return <button {...props} />;
  },
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
}));
vi.mock('@tuturuuu/ui/dialog', () => {
  const Container = ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  );
  return Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogDescription',
      'DialogHeader',
      'DialogTitle',
      'DialogTrigger',
    ].map((name) => [name, Container])
  );
});
vi.mock('./artwork-gallery-editor', () => ({
  ArtworkGalleryEditor: ({
    onChange,
    onPendingChange,
  }: {
    onChange: (
      items: { image: string; alt: string; caption: string; credit: string }[]
    ) => void;
    onPendingChange: (pending: boolean) => void;
  }) => (
    <>
      <button type="button" onClick={() => onPendingChange(true)}>
        start-gallery-upload
      </button>
      <button
        type="button"
        onClick={() => {
          onChange([
            {
              image: 'https://example.test/art.png',
              alt: 'Portrait',
              caption: 'Caption',
              credit: 'Artist',
            },
          ]);
          onPendingChange(false);
        }}
      >
        finish-gallery-upload
      </button>
    </>
  ),
}));
vi.mock('./document-view', () => ({ DocumentView: () => null }));
vi.mock('./rich-editor', () => ({
  RichEditor: ({
    onChange,
    onImageUpload,
  }: {
    onChange: (content: { type: string; text: string }) => void;
    onImageUpload: (file: File) => Promise<string>;
  }) => (
    <>
      <button
        type="button"
        onClick={() => {
          void onImageUpload(new File(['image'], 'art.png')).catch(() => {});
        }}
      >
        inline-upload
      </button>
      <button
        type="button"
        onClick={() => onChange({ type: 'text', text: 'New typing' })}
      >
        type
      </button>
    </>
  ),
}));

const record: LettinRecord = {
  id: 'world',
  version: 1,
  published: null,
  published_at: null,
  draft: {
    title: 'World',
    description: '',
    image: '',
    credit: '',
    kind: 'page',
    tags: [],
    links: [],
    content: { type: 'doc' },
  },
};
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
});
const click = async (text: string) => {
  const button = [...container.querySelectorAll('button')].find(
    (el) => el.textContent === text
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
};

it('keeps typing during a pending save dirty and saves it with the next revision', async () => {
  let finishSave!: () => void;
  mutateAsync.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      })
  );
  const onDirty = vi.fn();
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  await click('type');
  await click('saveDraft');
  await click('type');
  await act(async () => finishSave());
  expect(onDirty).not.toHaveBeenCalledWith(false);
  expect(container.textContent).toContain('unsaved');
  expect(mutateAsync.mock.calls[0]?.[0].version).toBe(1);

  mutateAsync.mockResolvedValueOnce({ id: 'world' });
  await click('saveDraft');
  expect(mutateAsync.mock.calls[1]?.[0].version).toBe(2);
  expect(onDirty).toHaveBeenLastCalledWith(false);
});

it('preserves local content and revision when a save conflicts', async () => {
  mutateAsync.mockRejectedValueOnce(new Error('Revision conflict'));
  const onDirty = vi.fn();
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  await click('type');
  await click('saveDraft');
  expect(onDirty).not.toHaveBeenCalledWith(false);
  expect(container.textContent).toContain('unsaved');
  mutateAsync.mockResolvedValueOnce({ id: 'world' });
  await click('saveDraft');
  expect(mutateAsync.mock.calls[1]?.[0].version).toBe(1);
  expect(mutateAsync.mock.calls[1]?.[0].draft.content.text).toBe('New typing');
});

it('blocks save and discard while gallery artwork uploads, then saves the completed draft', async () => {
  mutateAsync.mockResolvedValue({ id: 'world' });
  const onDirty = vi.fn();
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  await click('start-gallery-upload');
  const button = (text: string) =>
    [...container.querySelectorAll('button')].find(
      (el) => el.textContent === text
    )!;
  expect(button('saveDraft').disabled).toBe(true);
  expect(button('discardDraft').disabled).toBe(true);
  expect(button('publish').disabled).toBe(true);
  expect(onDirty).toHaveBeenLastCalledWith(true);
  await click('finish-gallery-upload');
  expect(button('saveDraft').disabled).toBe(false);
  await click('saveDraft');
  expect(mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({
        gallery: [
          {
            image: 'https://example.test/art.png',
            alt: 'Portrait',
            caption: 'Caption',
            credit: 'Artist',
          },
        ],
      }),
    })
  );
  expect(onDirty).toHaveBeenLastCalledWith(false);
});

it('saves a notice through the private draft command without publishing it', async () => {
  mutateAsync.mockResolvedValueOnce({ id: 'world' });
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={() => {}}
      />
    )
  );
  const input = [...container.querySelectorAll('label')]
    .find((label) => label.textContent?.startsWith('contentNotice'))
    ?.querySelector('textarea');
  expect(input).toBeDefined();
  expect(input?.maxLength).toBe(500);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )?.set?.call(input, 'Spoilers for chapter two');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('saveDraft');
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
    action: 'saveWorld',
    draft: { contentNotice: 'Spoilers for chapter two' },
  });
});

it('saves creation guidance through the private draft command and marks edits dirty', async () => {
  mutateAsync.mockResolvedValueOnce({ id: 'world' });
  const onDirty = vi.fn();
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  expect(mutateAsync).not.toHaveBeenCalled();
  const input = [...container.querySelectorAll('label')]
    .find((label) => label.textContent?.startsWith('creationUsageNotes'))!
    .querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )!.set!.call(input, 'Ask before adaptations');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onDirty).toHaveBeenLastCalledWith(true);
  await click('saveDraft');
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
    action: 'saveWorld',
    version: 1,
    draft: {
      creationGuidance: {
        credits: '',
        usageNotes: 'Ask before adaptations',
        collaboration: 'unspecified',
      },
    },
  });
});

it.each([true, false])(
  'passes only an active published snapshot into preview: %s',
  async (active) => {
    const snapshot = { ...record.draft, title: 'Saved published title' };
    await act(async () =>
      root.render(
        <EntryEditor
          wsId="workspace"
          worldId="world"
          record={{
            ...record,
            published: snapshot,
            published_at: active ? '2026-10-10T00:00:00Z' : null,
          }}
          worldRole="owner"
          isWorld
          entries={[]}
          onDirty={vi.fn()}
        />
      )
    );
    expect(preview).toHaveBeenLastCalledWith({
      draft: record.draft,
      published: active ? snapshot : null,
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  }
);

it.each([true, false])(
  'stages the published snapshot locally and saves it only explicitly (notebook=%s)',
  async (isWorld) => {
    const published = {
      ...record.draft,
      title: 'Public version',
      tags: ['public-tag'],
      gallery: [
        {
          image: 'https://example.test/public.png',
          alt: 'Public artwork',
          caption: 'Published',
          credit: 'Artist',
        },
      ],
    };
    const initial = {
      ...record,
      published,
      published_at: '2026-10-10',
      draft: {
        ...record.draft,
        tags: ['private-tag'],
        gallery: [
          {
            image: 'https://example.test/private.png',
            alt: 'Private artwork',
            caption: 'Unsaved',
            credit: 'Artist',
          },
        ],
        contentNotice: 'Private new notice',
      },
    };
    const onDirty = vi.fn();
    await act(() =>
      root.render(
        <EntryEditor
          wsId="workspace"
          worldId="world"
          record={initial}
          worldRole="editor"
          isWorld={isWorld}
          entries={[]}
          onDirty={onDirty}
        />
      )
    );
    await click('stagePublishedDraft');
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onDirty).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('input')?.value).toBe('Public version');
    expect(container.textContent).toContain('unsaved');
    expect(
      [...container.querySelectorAll('button')].some(
        (b) => b.textContent === 'publish'
      )
    ).toBe(false);
    if (!isWorld)
      expect(
        [...container.querySelectorAll('input')].some(
          (i) => i.value === 'public-tag'
        )
      ).toBe(true);
    mutateAsync.mockResolvedValueOnce({ id: 'world' });
    await click('saveDraft');
    expect(mutateAsync).toHaveBeenCalledWith(
      isWorld
        ? {
            action: 'saveWorld',
            worldId: 'world',
            version: 1,
            draft: published,
          }
        : {
            action: 'saveEntry',
            worldId: 'world',
            entryId: 'world',
            version: 1,
            draft: published,
          }
    );
    expect(mutateAsync.mock.calls[0]?.[0].draft).not.toHaveProperty(
      'contentNotice'
    );
  }
);
it('can discard the staged snapshot back to the saved private draft', async () => {
  const initial = {
    ...record,
    published: { ...record.draft, title: 'Public version' },
    published_at: '2026-10-10',
  };
  const onDirty = vi.fn();
  await act(() =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={initial}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  await click('stagePublishedDraft');
  const discard = [...container.querySelectorAll('button')]
    .filter((b) => b.textContent === 'discardDraft')
    .at(-1)!;
  await act(() => discard.click());
  expect(container.querySelector('input')?.value).toBe('World');
  expect(onDirty).toHaveBeenLastCalledWith(false);
  expect(mutateAsync).not.toHaveBeenCalled();
});

it('blocks staging until all overlapping inline and gallery artwork uploads settle', async () => {
  let finishFirst!: (value: { image: string }) => void;
  let failSecond!: (error: Error) => void;
  uploadArtwork
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failSecond = reject;
        })
    );
  const initial = {
    ...record,
    published: { ...record.draft, title: 'Public version' },
    published_at: '2026-10-10',
  };
  await act(() =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={initial}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={() => {}}
      />
    )
  );
  await click('inline-upload');
  await click('inline-upload');
  await click('start-gallery-upload');
  const restore = () =>
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'stagePublishedDraft'
    )!;
  expect(restore().disabled).toBe(true);
  await act(() => finishFirst({ image: 'image' }));
  expect(restore().disabled).toBe(true);
  await act(() => failSecond(new Error('Upload failed')));
  expect(restore().disabled).toBe(true);
  await click('stagePublishedDraft');
  expect(container.querySelector('input')?.value).toBe(record.draft.title);
  await click('finish-gallery-upload');
  expect(restore().disabled).toBe(false);
  expect(mutateAsync).not.toHaveBeenCalled();
});

it('changes private work progress only through an explicit revision-aware save', async () => {
  mutateAsync.mockResolvedValueOnce({ id: 'world' });
  const onDirty = vi.fn();
  await act(async () =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={onDirty}
      />
    )
  );
  const control = [...container.querySelectorAll('select')].find((el) =>
    el.parentElement?.textContent?.includes('workProgressHint')
  )!;
  expect(control.value).toBe('unstarted');
  await act(async () => {
    control.value = 'ready';
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onDirty).toHaveBeenLastCalledWith(true);
  expect(mutateAsync).not.toHaveBeenCalled();
  await click('saveDraft');
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
    action: 'saveWorld',
    version: 1,
    draft: { workProgress: 'ready' },
  });
});

it.each([
  [true, undefined],
  [false, undefined],
  [true, 'ready'],
  [false, 'ready'],
] as const)(
  'retains current private progress when restoring authored content (notebook=%s, historical=%s)',
  async (isWorld, historicalProgress) => {
    const published = {
      ...record.draft,
      title: 'Published authored text',
      workProgress: historicalProgress,
    };
    const initial = {
      ...record,
      published,
      published_at: '2026-10-10',
      draft: {
        ...record.draft,
        title: 'Private changed text',
        workProgress: 'revising' as const,
        contentNotice: 'Private changed notice',
      },
    };
    const onDirty = vi.fn();
    await act(() =>
      root.render(
        <EntryEditor
          wsId="workspace"
          worldId="world"
          record={initial}
          worldRole="owner"
          isWorld={isWorld}
          entries={[]}
          onDirty={onDirty}
        />
      )
    );
    await click('stagePublishedDraft');
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onDirty).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('input')?.value).toBe(
      'Published authored text'
    );
    const progress = [...container.querySelectorAll('select')].find((el) =>
      el.parentElement?.textContent?.includes('workProgressHint')
    )!;
    expect(progress.value).toBe('revising');
    mutateAsync.mockResolvedValueOnce({ id: 'world' });
    await click('saveDraft');
    expect(mutateAsync).toHaveBeenCalledOnce();
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({
      action: isWorld ? 'saveWorld' : 'saveEntry',
      version: 1,
      draft: { title: 'Published authored text', workProgress: 'revising' },
    });
    expect(mutateAsync.mock.calls[0]![0].draft).not.toHaveProperty(
      'contentNotice'
    );
  }
);

it('updates private writing counts from unsaved body changes without a save or publication', async () => {
  await act(() =>
    root.render(
      <EntryEditor
        wsId="workspace"
        worldId="world"
        record={record}
        worldRole="owner"
        isWorld
        entries={[]}
        onDirty={vi.fn()}
      />
    )
  );
  const counts = () =>
    [
      ...container.querySelectorAll(
        'section[aria-label="writingStatistics"] dd'
      ),
    ].map((node) => node.textContent);
  expect(counts()).toEqual(['0', '0']);
  await click('type');
  expect(counts()).toEqual(['2', '9']);
  expect(mutateAsync).not.toHaveBeenCalled();
});
