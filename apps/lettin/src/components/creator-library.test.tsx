// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CreatorBookmark } from './creator-bookmark';
import { SavedCreators } from './saved-creators';

const api = vi.hoisted(() => ({
  status: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  getLettinCreatorSaved: api.status,
  getLettinSavedCreators: api.list,
  setLettinCreatorSaved: api.save,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props} />
  ),
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
const container = document.createElement('div'),
  root = createRoot(container);
let client: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  client?.clear();
  vi.clearAllMocks();
});
async function render(node: React.ReactNode) {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    );
  });
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function click(text: string) {
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === text)!
      .click()
  );
  await settle();
}
it('saves only on explicit action and keeps private caches scoped to the actor', async () => {
  api.status.mockResolvedValue({ saved: false });
  api.save.mockResolvedValue({ saved: true });
  await render(<CreatorBookmark creatorId="world" actorId="actor-a" />);
  expect(api.status).toHaveBeenCalledWith('world', 'actor-a');
  expect(api.save).not.toHaveBeenCalled();
  await click('saveCreator');
  expect(api.save).toHaveBeenCalledWith('world', true, 'actor-a');
  expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(
    client.getQueryData(['lettin-creator-reader', 'actor-a', 'saved', 'world'])
  ).toEqual({ saved: true });
  expect(
    client.getQueryData(['lettin-creator-reader', 'actor-b', 'saved', 'world'])
  ).toBeUndefined();
});
it('retains the previous saved state after a failed mutation with no automatic retry', async () => {
  api.status.mockResolvedValue({ saved: true });
  api.save.mockRejectedValue(new Error('Account changed'));
  await render(<CreatorBookmark creatorId="world" actorId="actor-a" />);
  await click('removeSavedCreator');
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(container.querySelector('[role="alert"]')!.textContent).toBe(
    'requestFailed'
  );
});
it('renders unavailable bookmarks without source links or stored source metadata', async () => {
  api.list.mockResolvedValue([
    { creatorId: 'hidden', savedAt: 'date', notebookTitle: null },
    {
      creatorId: 'public',
      savedAt: 'date',
      notebookTitle: 'Current title',
    },
  ]);
  await render(<SavedCreators actorId="actor-a" />);
  expect(api.list).toHaveBeenCalledWith('actor-a');
  expect(container.textContent).toContain('savedCreatorUnavailable');
  expect(container.querySelector('a[href="/creators/hidden"]')).toBeNull();
  expect(
    container.querySelector('a[href="/creators/public"]')!.textContent
  ).toBe('savedCreatorNotebook');
  expect(api.save).not.toHaveBeenCalled();
});
it('removes unavailable references only after successful server confirmation', async () => {
  api.list.mockResolvedValue([
    { creatorId: 'hidden', savedAt: 'date', notebookTitle: null },
  ]);
  api.save.mockResolvedValue({ saved: false });
  await render(<SavedCreators actorId="actor-a" />);
  api.list.mockResolvedValue([]);
  await click('removeSavedCreator');
  expect(api.save).toHaveBeenCalledWith('hidden', false, 'actor-a');
  expect(container.textContent).toContain('noSavedCreators');
});
it('fences overlapping explicit saves before the pending render', async () => {
  api.status.mockResolvedValue({ saved: false });
  let finish!: (value: { saved: boolean }) => void;
  api.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render(<CreatorBookmark creatorId="world" actorId="actor-a" />);
  await act(async () => {
    container.querySelector('button')!.click();
    container.querySelector('button')!.click();
  });
  expect(api.save).toHaveBeenCalledTimes(1);
  await act(async () => finish({ saved: true }));
  await settle();
});

it('keeps an old pending save isolated when the creator control is replaced', async () => {
  api.status.mockResolvedValue({ saved: false });
  let finish!: (value: { saved: boolean }) => void;
  api.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render(
    <CreatorBookmark key="actor-a:first" creatorId="first" actorId="actor-a" />
  );
  await act(async () => container.querySelector('button')!.click());
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <CreatorBookmark
          key="actor-a:second"
          creatorId="second"
          actorId="actor-a"
        />
      </QueryClientProvider>
    )
  );
  await settle();
  await act(async () => finish({ saved: true }));
  await settle();
  expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe(
    'false'
  );
  expect(
    client.getQueryData(['lettin-creator-reader', 'actor-a', 'saved', 'second'])
  ).toEqual({ saved: false });
  expect(api.save).toHaveBeenCalledWith('first', true, 'actor-a');
});
