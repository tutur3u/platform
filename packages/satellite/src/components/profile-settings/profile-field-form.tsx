'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from '@tuturuuu/icons';
import {
  updateCurrentUserEmail,
  updateCurrentUserFullName,
  updateCurrentUserProfile,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { satelliteProfileQueryKey } from './profile-avatar-editor';

type ProfileField = 'display_name' | 'email' | 'full_name';

export function ProfileFieldForm({
  field,
  initialValue,
  placeholder,
}: {
  field: ProfileField;
  initialValue: string | null;
  placeholder?: string | null;
}) {
  const t = useTranslations('settings-account');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();
  const [value, setValue] = useState(initialValue ?? '');
  useEffect(() => setValue(initialValue ?? ''), [initialValue]);

  const mutation = useMutation({
    mutationFn: async () => {
      const normalized = value.trim();
      if (!normalized) throw new Error('empty-value');
      if (field === 'display_name') {
        await updateCurrentUserProfile({ display_name: normalized });
      } else if (field === 'full_name') {
        await updateCurrentUserFullName(normalized);
      } else {
        await updateCurrentUserEmail(normalized);
      }
    },
    onError: () =>
      toast.error(t('error-occurred'), { description: t('please-try-again') }),
    onSuccess: async () => {
      toast.success(t('profile-updated'));
      await queryClient.invalidateQueries({
        queryKey: [...satelliteProfileQueryKey],
      });
    },
  });
  const isDirty = value.trim() !== (initialValue ?? '').trim();

  return (
    <form
      className="flex w-full items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (isDirty) mutation.mutate();
      }}
    >
      <Input
        aria-label={t(
          field === 'display_name'
            ? 'display-name'
            : field === 'full_name'
              ? 'full-name'
              : 'email-address'
        )}
        autoComplete={field === 'email' ? 'email' : 'name'}
        placeholder={placeholder ?? undefined}
        type={field === 'email' ? 'email' : 'text'}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        aria-label={commonT('save')}
        className="shrink-0"
        disabled={!isDirty || !value.trim() || mutation.isPending}
        size="icon"
        type="submit"
      >
        {mutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
      </Button>
    </form>
  );
}
