import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createStarterDraft } from './starter-drafts';
import { WorldStudio } from './world-studio';

const worldId = '00000000-0000-4000-8000-000000000001';
const entryId = '00000000-0000-4000-8000-000000000002';
const draft = createStarterDraft(
  'Private notebook title',
  'blank',
  (key) => key
);
const { state } = vi.hoisted(() => ({ state: { data: {} as unknown } }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.data, isPending: false, isError: false }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: Record<string, unknown>) => <a {...props} />,
}));
vi.mock('./navigation-guard', () => ({
  useNavigationGuard: () => ({ dirty: false, setDirty: () => {} }),
}));
vi.mock('./entry-editor', () => ({ EntryEditor: () => null }));
vi.mock('./wiki-browser', () => ({ WikiBrowser: () => null }));
vi.mock('./wiki-sidebar', () => ({ WikiSidebar: () => null }));
vi.mock('./wiki-create-entry', () => ({ WikiCreateEntry: () => null }));
vi.mock('./collaborators', () => ({ Collaborators: () => null }));
it.each([undefined, worldId, entryId])(
  'offers an ID-only handoff for the current selection %s',
  (initialEntry) => {
    state.data = {
      world: { id: worldId, draft, published_at: null },
      entries: [{ id: entryId, draft }],
      role: 'editor',
    };
    const html = renderToStaticMarkup(
      <WorldStudio
        wsId="personal"
        worldId={worldId}
        initialEntry={initialEntry}
      />
    );
    const href = html.match(/href="([^"]+)"[^>]*>planTask/);
    expect(href).not.toBeNull();
    const url = new URL(href![1]!.replaceAll('&amp;', '&'));
    expect(url.pathname).toBe('/en/personal/tasks/new');
    expect(url.searchParams.get('lettinWorld')).toBe(worldId);
    expect(url.searchParams.get('lettinEntry')).toBe(
      initialEntry === entryId ? entryId : null
    );
    expect(url.toString()).not.toContain('Private');
  }
);
