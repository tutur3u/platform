'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit3, Fingerprint, Plus, Trash2, X } from '@tuturuuu/icons';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSectionMessage } from '@tuturuuu/ui/custom/settings-section';
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
    <>
      <SettingItemTab
        title={t('passkeys-title')}
        description={t('passkeys-description')}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
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
      </SettingItemTab>

      {passkeysQuery.isLoading ? (
        <SettingsSectionMessage icon={<LoadingIndicator className="size-4" />}>
          {t('passkeys-loading')}
        </SettingsSectionMessage>
      ) : passkeysQuery.isError ? (
        <SettingsSectionMessage
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => passkeysQuery.refetch()}
            >
              {t('passkeys-retry')}
            </Button>
          }
          tone="error"
        >
          {t('passkeys-load-error')}
        </SettingsSectionMessage>
      ) : passkeys.length === 0 ? (
        <SettingsSectionMessage>
          <p className="font-medium text-foreground">
            {t('passkeys-empty-title')}
          </p>
          <p className="mt-0.5">{t('passkeys-empty-description')}</p>
        </SettingsSectionMessage>
      ) : (
        passkeys.map((passkey) => {
          const isEditing = editingPasskeyId === passkey.id;
          const displayName = passkey.friendly_name || t('passkeys-unnamed');
          const createdAt = formatPasskeyDate(passkey.created_at);
          const lastUsedAt = formatPasskeyDate(passkey.last_used_at);
          const createdLabel = createdAt
            ? t('passkeys-created-at', { date: createdAt })
            : t('passkeys-created');
          const lastUsedLabel = lastUsedAt
            ? ` · ${t('passkeys-last-used-at', { date: lastUsedAt })}`
            : '';

          return (
            <SettingItemTab
              key={passkey.id}
              title={
                isEditing ? (
                  <Input
                    aria-label={t('passkeys-name-label')}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    className="h-9 max-w-sm font-normal"
                    disabled={updateMutation.isPending}
                  />
                ) : (
                  <span className="truncate">{displayName}</span>
                )
              }
              description={`${createdLabel}${lastUsedLabel}`}
              icon={<Fingerprint className="size-4" />}
            >
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('passkeys-save')}
                      disabled={!editingName.trim() || updateMutation.isPending}
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
            </SettingItemTab>
          );
        })
      )}
    </>
  );
}
