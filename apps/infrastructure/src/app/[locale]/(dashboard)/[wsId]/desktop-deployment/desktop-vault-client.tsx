'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type DesktopVaultMutation,
  type DesktopVaultVersion,
  getDesktopVaultState,
  mutateDesktopVault,
  uploadDesktopVaultFile,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { DesktopPlatformPanel } from './desktop-platform-panel';
import { DesktopTokenPanel } from './desktop-token-panel';

function statusOf(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error
    ? error.status
    : null;
}

export function DesktopVaultClient({ actorId }: { actorId: string }) {
  // Actor changes destroy local credential inputs and one-time token state.
  return <DesktopVaultSession key={actorId} actorId={actorId} />;
}

function DesktopVaultSession({ actorId }: { actorId: string }) {
  const t = useTranslations('desktop-deployment.vault');
  const client = useQueryClient();
  const key = ['desktop-signing-vault', actorId];
  const scope = useRef(true);
  const busy = useRef(false);
  const operation = useRef<(() => Promise<void>) | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  // Lifecycle cleanup only; all data reads and writes use TanStack Query.
  useEffect(() => {
    scope.current = true;
    return () => {
      scope.current = false;
      operation.current = null;
    };
  }, []);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getDesktopVaultState(),
    retry: false,
    staleTime: 0,
  });
  const mutation = useMutation({
    gcTime: 0,
    // The shared MutationCache receives neither credentials as variables nor
    // response tokens as data. Private inputs live only in this actor's operation.
    mutationFn: async () => {
      const current = operation.current;
      operation.current = null;
      if (!current) throw new Error('Desktop operation unavailable');
      try {
        await current();
      } catch (error) {
        // Never retain a server body or input-bearing exception in MutationCache.
        throw Object.assign(new Error('Desktop operation rejected'), {
          status: typeof statusOf(error) === 'number' ? statusOf(error) : null,
        });
      }
    },
    onError: (error) => {
      if (!scope.current) return;
      setFailed(true);
      setToken(null);
      if (statusOf(error) === 401 || statusOf(error) === 403) setDenied(true);
      if (statusOf(error) === 409)
        void client.invalidateQueries({ queryKey: key });
    },
  });
  async function run(current: () => Promise<void>) {
    if (!scope.current || busy.current)
      throw new Error('Desktop operation unavailable');
    busy.current = true;
    operation.current = current;
    try {
      await mutation.mutateAsync();
    } finally {
      if (operation.current === current) operation.current = null;
      busy.current = false;
    }
  }
  function publish(result: Awaited<ReturnType<typeof mutateDesktopVault>>) {
    if (!scope.current) return;
    client.setQueryData(key, result.state);
    if (typeof result.token === 'string') setToken(result.token);
    setFailed(false);
  }
  async function act(input: DesktopVaultMutation) {
    if (input.action === 'create_token') setToken(null);
    await run(async () => {
      publish(await mutateDesktopVault(input));
    });
  }
  async function upload(
    version: DesktopVaultVersion,
    name: string,
    file: File
  ) {
    if (file.size === 0 || file.size > 2097152) {
      setFailed(true);
      throw new Error('Desktop file rejected');
    }
    await run(async () => {
      publish(
        await uploadDesktopVaultFile({
          versionId: version.id,
          revision: version.revision,
          name,
          file,
        })
      );
    });
  }
  if (denied || query.isError)
    return (
      <section className="space-y-3 rounded-lg border p-4" role="alert">
        <p>
          {t(
            denied ||
              statusOf(query.error) === 401 ||
              statusOf(query.error) === 403
              ? 'accessDenied'
              : 'unavailable'
          )}
        </p>
        {!denied &&
          statusOf(query.error) !== 401 &&
          statusOf(query.error) !== 403 && (
            <Button
              variant="outline"
              onClick={() => {
                void query.refetch();
              }}
            >
              {t('retry')}
            </Button>
          )}
      </section>
    );
  if (!query.data) return <p role="status">{t('loading')}</p>;
  return (
    <section className="space-y-4" aria-label={t('title')}>
      <header className="space-y-2">
        <h2 className="font-semibold text-xl">{t('title')}</h2>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      {failed && (
        <div role="alert" className="space-y-2 text-destructive text-sm">
          <p>{t('operationFailed')}</p>
          <Button
            variant="outline"
            onClick={() => {
              setFailed(false);
              void query.refetch();
            }}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      {mutation.isPending && (
        <p role="status" className="text-muted-foreground text-sm">
          {t('saving')}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {(['windows', 'macos'] as const).map((platform) => (
          <DesktopPlatformPanel
            key={platform}
            platform={platform}
            versions={query.data.versions}
            pending={mutation.isPending}
            act={act}
            upload={upload}
          />
        ))}
      </div>
      <DesktopTokenPanel
        state={query.data}
        pending={mutation.isPending}
        token={token}
        clearToken={() => setToken(null)}
        act={act}
      />
    </section>
  );
}
