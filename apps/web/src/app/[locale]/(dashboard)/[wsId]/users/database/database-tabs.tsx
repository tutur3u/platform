'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

type DatabaseTab = 'users' | 'audit-log';

interface Props {
  activeTab: DatabaseTab;
  usersContent?: React.ReactNode;
  auditLogContent?: React.ReactNode;
}

export function DatabaseTabs({
  activeTab,
  usersContent,
  auditLogContent,
}: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleTabChange = (value: string) => {
    if (value !== 'users' && value !== 'audit-log') return;
    if (value === activeTab) return;

    const params = new URLSearchParams(searchParams.toString());

    if (value === 'users') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }

    const nextUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;

    startTransition(() => {
      router.replace(nextUrl);
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-6 grid h-auto w-full max-w-sm grid-cols-2 rounded-2xl border bg-muted/50 p-1">
        <TabsTrigger
          value="users"
          disabled={isPending}
          className="rounded-xl px-4 py-2.5"
        >
          {t('ws-users.plural')}
        </TabsTrigger>
        <TabsTrigger
          value="audit-log"
          disabled={isPending}
          className="rounded-xl px-4 py-2.5"
        >
          {t('ws-users.audit_log')}
        </TabsTrigger>
      </TabsList>
      {activeTab === 'users' ? (
        <TabsContent value="users" className="mt-0">
          {usersContent}
        </TabsContent>
      ) : (
        <TabsContent value="audit-log" className="mt-0">
          {auditLogContent}
        </TabsContent>
      )}
    </Tabs>
  );
}
