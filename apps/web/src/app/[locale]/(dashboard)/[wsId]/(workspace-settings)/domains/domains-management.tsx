'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWorkspaceDomain,
  listWorkspaceDomains,
  type WorkspaceDomainsOverview,
} from '@tuturuuu/internal-api/workspace-domains';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { DomainItem } from './domain-item';
import { EntitlementSummary } from './entitlement-summary';
import { domainsKey, useDomainErrorMessage } from './shared';

type View =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: WorkspaceDomainsOverview };

export function DomainsManagement({ wsId }: { wsId: string }) {
  const t = useTranslations('workspace-domains');
  const cache = useQueryClient();
  const errorMessage = useDomainErrorMessage();
  const [hostname, setHostname] = useState('');
  const overview = useQuery({
    queryKey: domainsKey(wsId),
    queryFn: () => listWorkspaceDomains(wsId),
    retry: false,
  });
  const add = useMutation({
    mutationFn: (value: string) => addWorkspaceDomain(wsId, value),
    onSuccess: async () => {
      setHostname('');
      await cache.invalidateQueries({ queryKey: domainsKey(wsId) });
    },
  });

  const view: View = overview.isPending
    ? { kind: 'loading' }
    : overview.isError
      ? { kind: 'error' }
      : { kind: 'ready', data: overview.data };

  const header = (
    <header className="space-y-1">
      <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('description')}</p>
    </header>
  );

  switch (view.kind) {
    case 'loading':
      return (
        <main className="mx-auto w-full max-w-3xl space-y-8">
          {header}
          <SettingsSection>
            <SettingsSectionMessage>
              <span role="status">{t('loading')}</span>
            </SettingsSectionMessage>
          </SettingsSection>
        </main>
      );
    case 'error':
      return (
        <main className="mx-auto w-full max-w-3xl space-y-8">
          {header}
          <SettingsSection>
            <SettingsSectionMessage
              tone="error"
              action={
                <Button variant="outline" onClick={() => overview.refetch()}>
                  {t('retry')}
                </Button>
              }
            >
              {t('loadError')}
            </SettingsSectionMessage>
          </SettingsSection>
        </main>
      );
    case 'ready': {
      const { data } = view;
      const canAdd = data.canManage && data.entitlement.allowed;
      const submit = (event: FormEvent) => {
        event.preventDefault();
        if (hostname.trim()) add.mutate(hostname.trim());
      };
      return (
        <main className="mx-auto w-full max-w-3xl space-y-8">
          {header}
          <EntitlementSummary wsId={wsId} overview={data} />

          {data.canManage && (
            <SettingsSection title={t('addTitle')}>
              <form onSubmit={submit}>
                <div className="space-y-2 px-4 py-4 md:px-5">
                  <Label htmlFor="workspace-domain-hostname">
                    {t('hostnameLabel')}
                  </Label>
                  <Input
                    id="workspace-domain-hostname"
                    value={hostname}
                    onChange={(event) => setHostname(event.target.value)}
                    placeholder={t('hostnamePlaceholder')}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={!canAdd || add.isPending}
                    aria-describedby="workspace-domain-hostname-help"
                  />
                  <p
                    id="workspace-domain-hostname-help"
                    className="text-muted-foreground text-sm"
                  >
                    {t('hostnameHelp', { target: data.cnameTarget })}
                  </p>
                  {add.error && (
                    <p role="alert" className="text-dynamic-red text-sm">
                      {errorMessage(add.error)}
                    </p>
                  )}
                </div>
                <SettingsSectionFooter>
                  <Button
                    type="submit"
                    disabled={!canAdd || add.isPending || !hostname.trim()}
                  >
                    {add.isPending ? t('adding') : t('add')}
                  </Button>
                </SettingsSectionFooter>
              </form>
            </SettingsSection>
          )}

          <SettingsSection
            title={t('domainsTitle')}
            description={data.canManage ? undefined : t('readOnly')}
          >
            {data.domains.length === 0 ? (
              <SettingsSectionMessage>{t('empty')}</SettingsSectionMessage>
            ) : (
              data.domains.map((domain) => (
                <DomainItem
                  key={domain.id}
                  wsId={wsId}
                  domain={domain}
                  canManage={data.canManage}
                />
              ))
            )}
          </SettingsSection>
        </main>
      );
    }
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
}
