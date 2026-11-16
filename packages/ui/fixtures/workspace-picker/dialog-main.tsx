import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { NextIntlClientProvider } from 'next-intl';
import { createRoot } from 'react-dom/client';
import en from '../../../../apps/web/messages/en.json';
import vi from '../../../../apps/web/messages/vi.json';
import { useWorkspacePickerPreferences } from '../../src/components/ui/custom/use-workspace-picker-preferences';
import { WorkspacePickerDialog } from '../../src/components/ui/custom/workspace-picker-dialog';
import '../../src/globals.css';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
if (params.get('ui') === 'sorbet') document.documentElement.dataset.ui = 'sorbet';

function workspace(
  id: string,
  name: string,
  extra: Partial<InternalApiWorkspaceSummary> = {}
): InternalApiWorkspaceSummary {
  return {
    id,
    name,
    personal: false,
    avatar_url: null,
    logo_url: null,
    ...extra,
  };
}

const workspaces = [
  workspace('fictional-personal', 'Personal', { personal: true, tier: 'FREE' }),
  workspace('00000000-0000-0000-0000-000000000000', 'Platform', {
    tier: 'ENTERPRISE',
  }),
  workspace('fictional-current', 'Orchard design collective', { tier: 'PRO' }),
  workspace('fictional-default', 'Lunar research studio', { tier: 'PLUS' }),
  workspace('fictional-community', 'Paperboat community', { tier: 'FREE' }),
  workspace(
    'fictional-long-name',
    'Northwind regional tutoring cooperative and evening learning collective',
    { tier: 'ENTERPRISE' }
  ),
  workspace('fictional-guest', 'Shared board', { access_type: 'guest' }),
];

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Fixture() {
  const preferences = useWorkspacePickerPreferences('fictional-actor');
  const hidden = useQuery<string[]>({
    queryKey: ['fixture-hidden'],
    queryFn: async () => [],
    initialData: [],
    staleTime: Infinity,
  });
  const visibility = {
    ...hidden,
    accountDenied: false,
    actorId: 'fictional-actor',
    known: true,
    hiddenIds: hidden.data,
    pending: new Set<string>(),
    updateError: null,
    refetch: async () => hidden.refetch(),
    setHidden: async (id: string, hide: boolean) => {
      client.setQueryData<string[]>(['fixture-hidden'], (current = []) =>
        hide
          ? [...new Set([...current, id])]
          : current.filter((item) => item !== id)
      );
    },
  } satisfies Parameters<typeof WorkspacePickerDialog>[0]['visibility'];
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'vi' ? vi : en}>
      <WorkspacePickerDialog
        currentId="fictional-current"
        defaultId="fictional-default"
        onCreate={() => {}}
        onDefault={() => {}}
        onJoin={() => {}}
        onOpenChange={() => {}}
        onSelect={() => {}}
        open
        preferences={preferences}
        trigger={<button type="button">Select workspace</button>}
        visibility={visibility}
        workspaces={workspaces}
      />
    </NextIntlClientProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Fixture root is missing');
createRoot(root).render(
  <QueryClientProvider client={client}>
    <Fixture />
  </QueryClientProvider>
);
