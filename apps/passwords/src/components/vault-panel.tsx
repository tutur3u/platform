import { useNavigate } from '@tanstack/react-router';
import { Badge } from '@tuturuuu/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import { useI18n } from '../i18n/provider';
import type { PasswordsClientError } from '../service/client-error';
import type { AuditEvent, StepUpStatus, VaultDetail } from '../service/port';
import { AuditPanel } from './audit-panel';
import { ItemsPanel } from './items-panel';
import { MembersPanel } from './members-panel';
import { RotateVaultButton } from './rotate-vault-button';
import { StepUpNotice } from './step-up-notice';

export type VaultTab = 'items' | 'members' | 'activity';

interface Props {
  wsId: string;
  vault: VaultDetail;
  tab: VaultTab;
  audit: AuditEvent[] | null;
  stepUp: StepUpStatus;
}

export function VaultPanel({ wsId, vault, tab, audit, stepUp }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rotateStepUp, setRotateStepUp] = useState<string | null>(null);
  const isOwner = vault.summary.role === 'owner';
  const stepUpUrl = stepUp.state === 'required' ? stepUp.url : '';

  return (
    <section aria-labelledby="vault-title" className="grid content-start gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 id="vault-title" className="font-semibold text-xl">
            {vault.summary.name}
          </h1>
          <Badge variant="secondary">
            {t(`vault.role.${vault.summary.role}`)}
          </Badge>
        </div>
        {isOwner && (
          <RotateVaultButton
            wsId={wsId}
            vault={vault.summary}
            onError={(error: PasswordsClientError) =>
              setRotateStepUp(
                error.code === 'STEP_UP_REQUIRED'
                  ? (error.stepUpUrl ?? stepUpUrl)
                  : null
              )
            }
          />
        )}
      </header>
      {vault.summary.rotationRequired && (
        <output className="text-muted-foreground text-sm">
          {t('vault.rotationRequired')}
        </output>
      )}
      {rotateStepUp && <StepUpNotice url={rotateStepUp} />}
      <Tabs
        value={isOwner ? tab : 'items'}
        onValueChange={(next) =>
          navigate({
            to: '.',
            search: (prev) => ({ ...prev, tab: next as VaultTab }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="items">{t('tabs.items')}</TabsTrigger>
          {isOwner && (
            <TabsTrigger value="members">{t('tabs.members')}</TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger value="activity">{t('tabs.activity')}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="items" className="pt-4">
          <ItemsPanel wsId={wsId} vault={vault} stepUpUrl={stepUpUrl} />
        </TabsContent>
        {isOwner && (
          <TabsContent value="members" className="pt-4">
            <MembersPanel wsId={wsId} vault={vault} stepUpUrl={stepUpUrl} />
          </TabsContent>
        )}
        {isOwner && (
          <TabsContent value="activity" className="pt-4">
            <AuditPanel events={audit ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
