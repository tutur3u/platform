'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorkspaceMeeting } from '@tuturuuu/internal-api/meetings';
import { createAuthClient } from '@tuturuuu/supabase/next/auth-browser';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { LoadingRegion, Skeleton, SkeletonLine } from '@tuturuuu/ui/skeleton';
import { canCreateOnlineMeeting } from '@tuturuuu/utils/meet-creation-policy';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

export function MiraMeetingCreate({ wsId }: { wsId: string }) {
  const t = useTranslations('dashboard.mira_workspace');
  const form = useForm({ defaultValues: { name: '', time: '' } });
  const { name, time } = form.watch();
  const [created, setCreated] = useState(false);
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['mira-meeting-account'],
    queryFn: async () => {
      const { data, error } = await createAuthClient().auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
  const create = useMutation({
    mutationFn: () =>
      createWorkspaceMeeting(wsId, {
        name: name.trim(),
        time: new Date(time).toISOString(),
      }),
    onSuccess: () => {
      form.reset();
      setCreated(true);
      void queryClient.invalidateQueries({
        queryKey: ['mira-artifact', wsId, 'meetings'],
      });
    },
  });
  if (profile.isPending)
    return (
      <LoadingRegion
        className="space-y-3 rounded-lg bg-muted/40 p-3"
        srLabel={t('loading')}
      >
        <SkeletonLine barClassName="w-1/4" />
        <Skeleton aria-hidden className="h-9 w-full" />
        <SkeletonLine barClassName="w-1/4" />
        <Skeleton aria-hidden className="h-9 w-full" />
        <Skeleton aria-hidden className="h-8 w-28" />
      </LoadingRegion>
    );
  if (profile.isError)
    return (
      <div role="alert" className="space-y-2">
        <p className="text-destructive text-sm">{t('load_failed')}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void profile.refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    );
  if (
    !profile.data?.email_confirmed_at ||
    !canCreateOnlineMeeting(profile.data?.email)
  )
    return (
      <p className="text-muted-foreground text-xs">{t('meeting_restricted')}</p>
    );
  return (
    <Form {...form}>
      <form
        className="space-y-3 rounded-lg bg-muted/40 p-3"
        onSubmit={form.handleSubmit(() => {
          setCreated(false);
          create.mutate();
        })}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('meeting_name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  required
                  maxLength={255}
                  disabled={create.isPending}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="time"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('meeting_time')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="datetime-local"
                  required
                  disabled={create.isPending}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="sm"
          disabled={create.isPending || !name.trim() || !time}
        >
          {create.isPending ? t('creating') : t('create_meeting')}
        </Button>
        {create.isError && (
          <p role="alert" className="text-destructive text-sm">
            {t('create_failed')}
          </p>
        )}
        {created && (
          <p role="status" className="text-muted-foreground text-sm">
            {t('meeting_created')}
          </p>
        )}
      </form>
    </Form>
  );
}
