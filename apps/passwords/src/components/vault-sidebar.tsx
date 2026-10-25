import { Link } from '@tanstack/react-router';
import { Lock } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useI18n } from '../i18n/provider';
import type { VaultSummary } from '../service/port';
import { CreateVaultDialog } from './create-vault-dialog';

interface Props {
  wsId: string;
  vaults: VaultSummary[];
  selectedId: string | null;
}

export function VaultSidebar({ wsId, vaults, selectedId }: Props) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('vault.list')} className="grid content-start gap-2">
      <ul className="grid gap-1">
        {vaults.map((vault) => {
          const selected = vault.id === selectedId;
          return (
            <li key={vault.id}>
              <Link
                to="."
                search={{ vault: vault.id }}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  selected && 'bg-accent font-medium text-accent-foreground'
                )}
              >
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{vault.name}</span>
                <Badge variant="secondary">
                  {t(`vault.role.${vault.role}`)}
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
      <CreateVaultDialog wsId={wsId} />
    </nav>
  );
}
