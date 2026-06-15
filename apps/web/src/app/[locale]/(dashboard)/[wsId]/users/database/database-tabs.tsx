'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

type DatabaseTab = 'users' | 'audit-log' | 'profile-links';

interface Props {
  activeTab: DatabaseTab;
  canViewUsers?: boolean;
  canViewAuditLog?: boolean;
  canManageProfileLinks?: boolean;
  usersContent?: React.ReactNode;
  auditLogContent?: React.ReactNode;
  profileLinksContent?: React.ReactNode;
}

export function DatabaseTabs({
  activeTab,
  canViewUsers = true,
  canViewAuditLog = true,
  canManageProfileLinks = false,
  usersContent,
  auditLogContent,
  profileLinksContent,
}: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const visibleTabCount = [
    canViewUsers,
    canViewAuditLog,
    canManageProfileLinks,
  ].filter(Boolean).length;

  const handleTabChange = (value: string) => {
    if (value !== 'users' && value !== 'audit-log' && value !== 'profile-links')
      return;
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
      <TabsList
        className={`mb-6 grid h-auto w-full ${
          visibleTabCount > 2 ? 'max-w-xl grid-cols-3' : ''
        } ${
          visibleTabCount === 2 ? 'max-w-sm grid-cols-2' : ''
        } ${visibleTabCount <= 1 ? 'max-w-sm grid-cols-1' : ''} rounded-2xl border bg-muted/50 p-1`}
      >
        {canViewUsers ? (
          <TabsTrigger
            value="users"
            disabled={isPending}
            className="rounded-xl px-4 py-2.5"
          >
            {t('ws-users.plural')}
          </TabsTrigger>
        ) : null}
        {canViewAuditLog ? (
          <TabsTrigger
            value="audit-log"
            disabled={isPending}
            className="rounded-xl px-4 py-2.5"
          >
            {t('ws-users.audit_log')}
          </TabsTrigger>
        ) : null}
        {canManageProfileLinks ? (
          <TabsTrigger
            value="profile-links"
            disabled={isPending}
            className="rounded-xl px-4 py-2.5"
          >
            {t('ws-user-profile-links.tab_label')}
          </TabsTrigger>
        ) : null}
      </TabsList>
      {activeTab === 'users' ? (
        <TabsContent value="users" className="mt-0">
          {usersContent}
        </TabsContent>
      ) : activeTab === 'profile-links' ? (
        <TabsContent value="profile-links" className="mt-0">
          {profileLinksContent}
        </TabsContent>
      ) : (
        <TabsContent value="audit-log" className="mt-0">
          {auditLogContent}
        </TabsContent>
      )}
    </Tabs>
  );
}
