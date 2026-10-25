import { createFileRoute } from '@tanstack/react-router';
import type { VaultTab } from '../../../components/vault-panel';
import { WorkspaceView } from '../../../components/workspace-view';
import { unwrap } from '../../../service/client-error';
import { loadAudit, loadState } from '../../../service/functions';

const tabs: readonly VaultTab[] = ['items', 'members', 'activity'];

export const Route = createFileRoute('/$locale/$wsId/')({
  validateSearch: (
    search: Record<string, unknown>
  ): { vault?: string; tab?: VaultTab } => ({
    vault: typeof search.vault === 'string' ? search.vault : undefined,
    tab: tabs.find((tab) => tab === search.tab),
  }),
  loaderDeps: ({ search }) => ({ vault: search.vault, tab: search.tab }),
  loader: async ({ params, deps }) => {
    const state = unwrap(
      await loadState({ data: { wsId: params.wsId, vaultId: deps.vault } })
    );
    const wantsAudit =
      deps.tab === 'activity' && state.vault?.summary.role === 'owner';
    const audit = wantsAudit
      ? unwrap(
          await loadAudit({
            data: { wsId: params.wsId, vaultId: state.vault?.summary.id ?? '' },
          })
        )
      : null;
    return { state, audit };
  },
  component: WorkspacePage,
});

function WorkspacePage() {
  const { wsId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { state, audit } = Route.useLoaderData();
  return (
    <WorkspaceView
      wsId={wsId}
      state={state}
      audit={audit}
      tab={tab ?? 'items'}
    />
  );
}
