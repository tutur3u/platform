'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Save, Search } from '@tuturuuu/icons';
import {
  getWorkspaceRateLimitSecrets,
  type SaveWorkspaceRateLimitSecretsPayload,
  saveWorkspaceRateLimitSecrets,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function WorkspaceSecretsControls({
  canManage,
}: {
  canManage: boolean;
}) {
  const t = useTranslations('rate-limits');
  const [wsIdInput, setWsIdInput] = useState('');
  const [loadedWsId, setLoadedWsId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const secretsQuery = useQuery({
    enabled: !!loadedWsId,
    queryFn: () => getWorkspaceRateLimitSecrets(loadedWsId as string),
    queryKey: [
      'infrastructure',
      'rate-limits',
      'workspace-secrets',
      loadedWsId,
    ],
  });

  const saveMutation = useMutation({
    mutationFn: (payload: SaveWorkspaceRateLimitSecretsPayload) =>
      saveWorkspaceRateLimitSecrets(payload),
    onError: () => toast.error(t('toasts.workspace_save_failed')),
    onSuccess: () => {
      toast.success(t('toasts.workspace_saved'));
      void secretsQuery.refetch();
      setEdits({});
    },
  });

  const data = secretsQuery.data;
  const isValidWsId = UUID_PATTERN.test(wsIdInput.trim());

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold text-lg">{t('workspace.title')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('workspace.description')}
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="rl-ws-id">{t('workspace.ws_id')}</Label>
          <Input
            id="rl-ws-id"
            onChange={(event) => setWsIdInput(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            value={wsIdInput}
          />
        </div>
        <Button
          disabled={!isValidWsId}
          onClick={() => {
            setEdits({});
            setLoadedWsId(wsIdInput.trim());
          }}
          type="button"
          variant="secondary"
        >
          <Search className="h-4 w-4" />
          {t('workspace.load')}
        </Button>
      </div>

      {secretsQuery.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {data.managedNames.map((name) => (
              <div className="space-y-1" key={name}>
                <Label
                  className="font-mono text-xs"
                  htmlFor={`rl-secret-${name}`}
                >
                  {name}
                </Label>
                <Input
                  disabled={!canManage}
                  id={`rl-secret-${name}`}
                  onChange={(event) =>
                    setEdits((prev) => ({
                      ...prev,
                      [name]: event.target.value,
                    }))
                  }
                  placeholder={t('workspace.unset')}
                  value={edits[name] ?? data.secrets[name] ?? ''}
                />
              </div>
            ))}
          </div>

          {canManage ? (
            <Button
              disabled={
                saveMutation.isPending || Object.keys(edits).length === 0
              }
              onClick={() => {
                const secrets: Record<string, string | null> = {};
                for (const [name, value] of Object.entries(edits)) {
                  secrets[name] = value.trim() ? value.trim() : null;
                }
                saveMutation.mutate({ secrets, wsId: data.wsId });
              }}
              type="button"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t('workspace.save')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
