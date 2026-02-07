'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface SelectGroupGatewayProps {
  wsId: string;
  /** Group IDs the user can access. `null` means admin — show all groups. */
  accessibleGroupIds: string[] | null;
}

export default function SelectGroupGateway({
  wsId,
  accessibleGroupIds,
}: SelectGroupGatewayProps) {
  const t = useTranslations('ws-user-groups');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();

  const query = useQuery<{ data: UserGroup[]; count: number }>({
    queryKey: ['ws-user-groups', wsId, accessibleGroupIds],
    queryFn: async () => {
      if (accessibleGroupIds !== null && accessibleGroupIds.length === 0) {
        return { data: [], count: 0 };
      }

      const supabase = await createClient();
      let builder = supabase
        .from('workspace_user_groups_with_amount')
        .select('id, name, amount', { count: 'exact' })
        .eq('ws_id', wsId);

      if (accessibleGroupIds !== null) {
        builder = builder.in('id', accessibleGroupIds);
      }

      const { data, error, count } = await builder.order('name');
      if (error) throw error;
      return { data: (data || []) as UserGroup[], count: count || 0 };
    },
    staleTime: 2 * 60 * 1000,
  });

  const groups = useMemo(() => query.data?.data ?? [], [query.data]);

  const onContinue = () => {
    if (!selectedGroupId || !pathname) return;

    // Replace the '~' placeholder in the current path while preserving locale and trailing segments
    const newPath = pathname.replace(
      '/users/groups/~',
      `/users/groups/${selectedGroupId}`
    );

    const sp = searchParams?.toString();
    router.replace(sp ? `${newPath}?${sp}` : newPath);
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-xl p-4">
        <div className="space-y-1">
          <h1 className="font-bold text-2xl">{t('select_group')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('select_group_description')}
          </p>
        </div>
        <Separator className="my-4" />

        <div className="space-y-2">
          <label className="font-semibold text-sm">{t('group_label')}</label>
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  query.isLoading
                    ? tc('loading')
                    : groups.length
                      ? t('select_group_placeholder')
                      : t('no_groups')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name || '—'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.replace(`/${wsId}/users/groups`)}
          >
            {tc('back')}
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            disabled={!selectedGroupId || query.isLoading}
          >
            {tc('continue')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
