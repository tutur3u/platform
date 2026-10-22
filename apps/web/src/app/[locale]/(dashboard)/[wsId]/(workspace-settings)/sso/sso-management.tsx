'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  createSsoClient,
  listSsoClients,
  type SsoClientInput,
  type SsoManagedClient,
  setSsoClientEnabled,
  updateSsoClient,
} from '@tuturuuu/internal-api/sso';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ClientDetails, ssoKey } from './client-details';
import { ClientEditor, EnableClientDialog } from './client-editor';
import { SsoMutationError } from './mutation-error';

export function SsoManagement({ wsId }: { wsId: string }) {
  const t = useTranslations('workspace-sso');
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    { kind: 'create' } | { kind: 'edit'; client: SsoManagedClient } | null
  >(null);
  const [reloaded, setReloaded] = useState(false);
  const [confirm, setConfirm] = useState<SsoManagedClient | null>(null);
  const overview = useQuery({
    queryKey: ssoKey(wsId),
    queryFn: () => listSsoClients(wsId),
    retry: false,
  });
  const selected = overview.data?.clients.find((c) => c.id === selectedId);
  const refresh = () => cache.invalidateQueries({ queryKey: ssoKey(wsId) });
  const save = useMutation({
    mutationFn: (input: SsoClientInput) =>
      editor?.kind === 'edit'
        ? updateSsoClient(wsId, editor.client.id, {
            ...input,
            expectedRevision: editor.client.revision,
            enabled: false,
          })
        : createSsoClient(wsId, input),
    onSuccess: async (result) => {
      setEditor(null);
      setReloaded(false);
      setSelectedId(result.id);
      await refresh();
    },
  });
  const refreshEditor = async () => {
    if (
      editor?.kind !== 'edit' ||
      !(save.error instanceof InternalApiError) ||
      save.error.status !== 409
    ) {
      await refresh();
      return;
    }
    const result = await overview.refetch();
    if (!result.isSuccess) return;
    const client = result.data.clients.find((c) => c.id === editor.client.id);
    setEditor((current) =>
      current === editor ? (client ? { kind: 'edit', client } : null) : current
    );
    save.reset();
    setReloaded(true);
  };
  const toggle = useMutation({
    mutationFn: ({
      client,
      enable,
    }: {
      client: SsoManagedClient;
      enable: boolean;
    }) => {
      return setSsoClientEnabled(wsId, client.id, {
        expectedRevision: client.revision,
        enabled: enable,
        confirmEnable: enable,
      });
    },
    onError: () => setConfirm(null),
    onSuccess: async () => {
      setConfirm(null);
      await refresh();
    },
  });
  if (overview.isPending) return <p role="status">{t('loading')}</p>;
  if (overview.isError)
    return (
      <div role="alert">
        {t('loadError')}{' '}
        <Button onClick={() => overview.refetch()}>{t('refresh')}</Button>
      </div>
    );
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>
      <section
        className="space-y-2 rounded-lg border bg-muted/30 p-4"
        aria-label={t('activation')}
      >
        <p role="status">
          {t(overview.data.globalEnabled ? 'globalOn' : 'globalOff')}
        </p>
        <p className="text-muted-foreground text-sm">{t('activationHelp')}</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            save.reset();
            setReloaded(false);
            setEditor({ kind: 'create' });
          }}
          disabled={save.isPending || toggle.isPending}
        >
          {t('createClient')}
        </Button>
        <Button
          variant="outline"
          onClick={refreshEditor}
          disabled={overview.isFetching || save.isPending || toggle.isPending}
        >
          {t('refresh')}
        </Button>
      </div>
      <SsoMutationError error={save.error ?? toggle.error} />
      {reloaded && <p role="status">{t('editorReloaded')}</p>}
      {editor && (
        <>
          <p className="text-muted-foreground text-sm">{t('editDisables')}</p>
          <ClientEditor
            key={
              editor.kind === 'edit'
                ? `${editor.client.id}:${editor.client.revision}`
                : 'new'
            }
            client={editor.kind === 'edit' ? editor.client : undefined}
            busy={save.isPending || overview.isFetching}
            onSave={(input) => save.mutate(input)}
            onCancel={() => setEditor(null)}
          />
        </>
      )}
      {overview.data.clients.length === 0 && <p>{t('noClients')}</p>}
      <ul className="space-y-2">
        {overview.data.clients.map((client) => (
          <li
            key={client.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div>
              <Button
                variant="link"
                className="h-auto p-0"
                aria-pressed={selectedId === client.id}
                onClick={() => {
                  setSelectedId(client.id);
                  setEditor(null);
                }}
              >
                {client.displayName}
              </Button>
              <p className="text-muted-foreground text-sm">
                {t(client.enabled ? 'enabled' : 'disabled')}
              </p>
              {client.requestSigningMode === null && (
                <p className="text-muted-foreground text-sm">
                  {t('legacyPolicy')}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={save.isPending || toggle.isPending}
                onClick={() => {
                  save.reset();
                  setReloaded(false);
                  setEditor({ kind: 'edit', client });
                }}
              >
                {t('edit')}
              </Button>
              <Button
                variant="outline"
                disabled={
                  save.isPending ||
                  toggle.isPending ||
                  (!client.enabled && client.requestSigningMode === null)
                }
                onClick={() =>
                  client.enabled
                    ? toggle.mutate({ client, enable: false })
                    : setConfirm(client)
                }
              >
                {t(client.enabled ? 'disable' : 'enable')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {selected && (
        <section className="space-y-4" aria-label={selected.displayName}>
          <h2 className="font-semibold text-xl">{selected.displayName}</h2>
          <ClientDetails key={selected.id} wsId={wsId} clientId={selected.id} />
        </section>
      )}
      <EnableClientDialog
        client={confirm}
        busy={toggle.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) toggle.mutate({ client: confirm, enable: true });
        }}
      />
    </main>
  );
}
