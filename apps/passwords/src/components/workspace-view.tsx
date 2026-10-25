import { useI18n } from '../i18n/provider';
import type { AuditEvent, PasswordsState } from '../service/port';
import { VaultPanel, type VaultTab } from './vault-panel';
import { VaultSidebar } from './vault-sidebar';

interface Props {
  wsId: string;
  state: PasswordsState;
  audit: AuditEvent[] | null;
  tab: VaultTab;
}

export function WorkspaceView({ wsId, state, audit, tab }: Props) {
  const { t } = useI18n();
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:grid-cols-[16rem_1fr]">
      <aside className="grid content-start gap-3">
        <h2 className="px-3 font-semibold text-lg">{t('app.title')}</h2>
        <VaultSidebar
          wsId={wsId}
          vaults={state.vaults}
          selectedId={state.vault?.summary.id ?? null}
        />
      </aside>
      {state.vault ? (
        <VaultPanel
          key={state.vault.summary.id}
          wsId={wsId}
          vault={state.vault}
          tab={tab}
          audit={audit}
          stepUp={state.stepUp}
        />
      ) : (
        <p className="self-center text-center text-muted-foreground">
          {state.vaults.length === 0 ? t('vault.empty') : t('vault.select')}
        </p>
      )}
    </main>
  );
}
