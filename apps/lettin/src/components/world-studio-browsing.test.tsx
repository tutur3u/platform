// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldStudio } from './world-studio';

const draft = (title: string) => ({
  title,
  description: '',
  image: '',
  credit: '',
  kind: 'page',
  tags: [],
  links: [],
  content: {
    type: 'doc',
    content: [{ type: 'text', text: 'Saved searchable words' }],
  },
});
const data = {
  world: {
    id: 'world',
    draft: draft('Notebook'),
    published: null,
    published_at: null,
    version: 1,
  },
  entries: [
    {
      id: 'private',
      draft: draft('Private entry'),
      published: null,
      published_at: null,
      version: 1,
    },
    {
      id: 'public',
      draft: draft('Public entry'),
      published: draft('Public entry'),
      published_at: '2026-10-09',
      version: 1,
    },
  ],
  role: 'editor',
};
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isPending: false, isError: false, data }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({
    isPending: false,
    error: null,
    reset: vi.fn(),
    mutateAsync: vi.fn(),
  }),
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({ getLettinWorld: vi.fn() }));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('./navigation-guard', () => ({
  useNavigationGuard: () => ({ dirty: false, setDirty: vi.fn() }),
}));
vi.mock('./entry-editor', () => ({
  EntryEditor: () => <div>entry-editor</div>,
}));
vi.mock('./notebook-export', () => ({ NotebookExport: () => null }));
vi.mock('./collaborators', () => ({ Collaborators: () => <div /> }));
vi.mock('./wiki-sidebar', () => ({ WikiSidebar: () => <div /> }));
vi.mock('./wiki-create-entry', () => ({ WikiCreateEntry: () => <div /> }));
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
});
it('retains selected facets across opening an entry and returning to browsing', async () => {
  await act(() =>
    root.render(<WorldStudio wsId="workspace" worldId="world" />)
  );
  const select = container.querySelector('select')!;
  await act(() => {
    select.value = 'private';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.querySelectorAll('.wiki-entry-card')).toHaveLength(1);
  await act(() =>
    (container.querySelector('.wiki-entry-card') as HTMLButtonElement).click()
  );
  expect(container.textContent).toContain('entry-editor');
  expect(container.textContent).toContain('duplicateEntry');
  await act(() =>
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'sectionoverview')!
      .click()
  );
  expect(container.querySelector('select')!.value).toBe('private');
  expect(container.querySelectorAll('.wiki-entry-card')).toHaveLength(1);
  expect(container.querySelector('.wiki-entry-card')!.textContent).toContain(
    'Private entry'
  );
});

it('keeps sibling context keys distinct while preserving Calendar state and resetting it on notebook change', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await act(() =>
      root.render(<WorldStudio wsId="workspace" worldId="world" />)
    );
    const date = container.querySelector<HTMLInputElement>('input[type=date]')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(date, '2026-10-10');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() =>
      root.render(
        <WorldStudio wsId="workspace" worldId="world" section="characters" />
      )
    );
    expect(
      container.querySelector<HTMLInputElement>('input[type=date]')!.value
    ).toBe('2026-10-10');
    await act(() =>
      root.render(<WorldStudio wsId="workspace" worldId="other" />)
    );
    expect(
      container.querySelector<HTMLInputElement>('input[type=date]')!.value
    ).toBe('');
    expect(
      errors.mock.calls.filter((call) =>
        call.some((value) => String(value).includes('same key'))
      )
    ).toEqual([]);
  } finally {
    errors.mockRestore();
  }
});
