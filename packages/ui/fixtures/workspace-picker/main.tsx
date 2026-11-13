import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import { WorkspaceVisibilityProvider } from '../../src/hooks/use-workspace-visibility';
import { WorkspaceSelect } from '../../src/components/ui/custom/workspace-select';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import en from '../../../../apps/web/messages/en.json';
import vi from '../../../../apps/web/messages/vi.json';
import type { useWorkspaceVisibility } from '../../src/hooks/use-workspace-visibility';
import { WorkspacePickerContent } from '../../src/components/ui/custom/workspace-picker-content';
import { useWorkspacePickerPreferences } from '../../src/components/ui/custom/use-workspace-picker-preferences';
import { Popover, PopoverTrigger } from '../../src/components/ui/popover';
import '../../src/globals.css';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
document.documentElement.classList.toggle(
  'dark',
  params.get('theme') === 'dark'
);
const state = params.get('state') ?? 'ready';
const workspaces = [
  'Orchard design collective',
  'Lunar research studio',
  'Paperboat community',
].map((name, index) => ({
  id: `fictional-${index}`,
  name,
  tier: 'PRO' as const,
  personal: false,
  avatar_url: null,
  logo_url: null,
}));
const fixtureRouter = {
  back() {}, forward() {}, refresh() {}, push() {}, replace() {},
  prefetch: async () => {},
};
const p0Workspaces = Array.from({ length: 42 }, (_, index) => ({
  ...workspaces[0]!, id: `fictional-${index}`,
  name: `Orchard workspace ${String(index + 1).padStart(2, '0')}`,
}));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
if (state === 'invitations-401') {
  // This fixture is network fenced: no request can reach a live service.
  globalThis.fetch = async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input), location.origin).pathname;
    if (path === '/api/v1/workspaces') return Response.json(p0Workspaces);
    if (path === '/api/workspaces/invitations') return Response.json({ message: 'Unauthorized' }, { status: 401 });
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  client.setQueryData(['workspace-hidden', 'fictional-actor-a'], []);
  client.setQueryData(['workspace-user', 'fictional-actor-a'], {
    id: 'fictional-actor-a', default_workspace_id: null,
  });
  client.setQueryData(['workspace-select-current-workspace', 'fictional-actor-a', 'fictional-0'], p0Workspaces[0]);
}

function Fixture() {
  const [actor, setActor] = useState('fictional-actor-a');
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [failure, setFailure] = useState(state === 'failure');
  const preferences = useWorkspacePickerPreferences(actor);
  const visibility = {
    actorId: actor,
    known: true,
    hiddenIds,
    pending: new Set<string>(),
    isError: false,
    updateError: null,
    refetch: async () => {},
    setHidden: async (id: string, hidden: boolean) => {
      setHiddenIds((ids) =>
        hidden ? [...ids, id] : ids.filter((value) => value !== id)
      );
    },
  } as unknown as ReturnType<typeof useWorkspaceVisibility>;
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'vi' ? vi : en}
    >
      <main className="min-h-screen bg-background p-4 text-foreground">
        <button
          onClick={() =>
            setActor((value) =>
              value.endsWith('a') ? 'fictional-actor-b' : 'fictional-actor-a'
            )
          }
        >
          Switch fictional actor
        </button>
        {state === 'invitations-401' ? (
          <AppRouterContext.Provider value={fixtureRouter}>
          <PathnameContext.Provider value="/en/fictional-0/tasks">
          <WorkspaceVisibilityProvider actorId="fictional-actor-a">
            <WorkspaceSelect wsId="fictional-0" cacheScope="fictional-actor-a"
              fetchWorkspaces={() => listWorkspaces()} />
          </WorkspaceVisibilityProvider>
          </PathnameContext.Provider>
          </AppRouterContext.Provider>
        ) : <Popover defaultOpen>
          <PopoverTrigger className="block rounded-md border p-2">
            {locale === 'vi' ? 'Chọn không gian làm việc' : 'Select workspace'}
          </PopoverTrigger>
          <WorkspacePickerContent
            key={actor}
            presentation="dropdown"
            preferences={preferences}
            workspaces={
              state === 'empty' || state === 'loading' ? [] : workspaces
            }
            currentId="fictional-0"
            defaultId="fictional-0"
            visibility={visibility}
            listLoading={state === 'loading'}
            listError={failure ? new Error('Fictional list failure') : null}
            onRetryList={() => setFailure(false)}
            onSelect={() => {}}
            onDefault={() => {}}
            onCreate={() => {}}
            onJoin={() => {}}
          />
        </Popover>}
      </main>
    </NextIntlClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><Fixture /></QueryClientProvider>
);
