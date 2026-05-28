'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit3, Fingerprint, Plus, Trash2, X } from '@tuturuuu/icons';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface PasskeyListItem {
  created_at: string;
  friendly_name?: string;
  id: string;
  last_used_at?: string;
}

const PASSKEYS_QUERY_KEY = ['auth', 'passkeys'];

function formatPasskeyDate(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function PasskeysSettings() {
  const t = useTranslations('settings-account');
  const queryClient = useQueryClient();
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const supabase = useMemo(() => createAuthClient(), []);

  const passkeysQuery = useQuery({
    queryKey: PASSKEYS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.auth.passkey.list();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw new Error(error.message);
    },
    onError: (error) => {
      toast.error(t('passkeys-register-error'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: async () => {
      toast.success(t('passkeys-register-success'));
      await queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      friendlyName,
      passkeyId,
    }: {
      friendlyName: string;
      passkeyId: string;
    }) => {
      const { error } = await supabase.auth.passkey.update({
        friendlyName,
        passkeyId,
      });

      if (error) throw new Error(error.message);
    },
    onError: (error) => {
      toast.error(t('passkeys-update-error'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: async () => {
      setEditingPasskeyId(null);
      setEditingName('');
      toast.success(t('passkeys-update-success'));
      await queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (passkeyId: string) => {
      const { error } = await supabase.auth.passkey.delete({ passkeyId });
      if (error) throw new Error(error.message);
    },
    onError: (error) => {
      toast.error(t('passkeys-delete-error'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSuccess: async () => {
      toast.success(t('passkeys-delete-success'));
      await queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
    },
  });

  const passkeys = passkeysQuery.data ?? [];
  const isMutating =
    registerMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const startRename = (passkey: PasskeyListItem) => {
    setEditingPasskeyId(passkey.id);
    setEditingName(passkey.friendly_name ?? '');
  };

  const saveRename = () => {
    const name = editingName.trim();
    if (!editingPasskeyId || !name) return;

    updateMutation.mutate({
      friendlyName: name,
      passkeyId: editingPasskeyId,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-sm">{t('passkeys-title')}</p>
          <p className="text-muted-foreground text-sm">
            {t('passkeys-description')}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => registerMutation.mutate()}
          disabled={isMutating}
        >
          {registerMutation.isPending ? (
            <LoadingIndicator className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          <span>{t('passkeys-add')}</span>
        </Button>
      </div>

      {passkeysQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border p-4 text-muted-foreground text-sm">
          <LoadingIndicator className="size-4" />
          <span>{t('passkeys-loading')}</span>
        </div>
      ) : passkeysQuery.isError ? (
        <div className="space-y-3 rounded-lg border border-dynamic-red/25 bg-dynamic-red/5 p-4">
          <p className="font-medium text-dynamic-red text-sm">
            {t('passkeys-load-error')}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => passkeysQuery.refetch()}
          >
            {t('passkeys-retry')}
          </Button>
        </div>
      ) : passkeys.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-dynamic-blue/10 text-dynamic-blue">
            <Fingerprint className="size-4" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">{t('passkeys-empty-title')}</p>
            <p className="text-muted-foreground text-sm">
              {t('passkeys-empty-description')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {passkeys.map((passkey) => {
            const isEditing = editingPasskeyId === passkey.id;
            const displayName = passkey.friendly_name || t('passkeys-unnamed');
            const createdAt = formatPasskeyDate(passkey.created_at);
            const lastUsedAt = formatPasskeyDate(passkey.last_used_at);

            return (
              <div
                key={passkey.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-dynamic-blue/10 text-dynamic-blue">
                    <Fingerprint className="size-4" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    {isEditing ? (
                      <Input
                        aria-label={t('passkeys-name-label')}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="h-9 max-w-sm"
                        disabled={updateMutation.isPending}
                      />
                    ) : (
                      <p className="truncate font-medium text-sm">
                        {displayName}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {createdAt
                        ? t('passkeys-created-at', { date: createdAt })
                        : t('passkeys-created')}
                      {lastUsedAt
                        ? ` · ${t('passkeys-last-used-at', {
                            date: lastUsedAt,
                          })}`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t('passkeys-save')}
                        disabled={
                          !editingName.trim() || updateMutation.isPending
                        }
                        onClick={saveRename}
                      >
                        {updateMutation.isPending ? (
                          <LoadingIndicator className="size-4" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t('passkeys-cancel-rename')}
                        disabled={updateMutation.isPending}
                        onClick={() => {
                          setEditingPasskeyId(null);
                          setEditingName('');
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('passkeys-rename')}
                      disabled={isMutating}
                      onClick={() => startRename(passkey)}
                    >
                      <Edit3 className="size-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t('passkeys-delete')}
                    disabled={isMutating}
                    onClick={() => deleteMutation.mutate(passkey.id)}
                    className="text-dynamic-red hover:text-dynamic-red"
                  >
                    {deleteMutation.isPending ? (
                      <LoadingIndicator className="size-4" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
