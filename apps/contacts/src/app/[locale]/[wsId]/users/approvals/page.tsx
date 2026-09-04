import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getContactsWorkspacePermissions } from '@/lib/workspace';
import { ApprovalsClient } from './approvals-client';
import {
  ApprovalsForbiddenGate,
  ApprovalsPersonalGate,
  ApprovalsUnavailableGate,
} from './approvals-gate';

export const metadata: Metadata = {
  title: 'Approvals',
  description: 'Review and approve user reports and posts.',
};

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function UserApprovalsPage({ params }: PageProps) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        if (isPersonal) {
          return <ApprovalsPersonalGate />;
        }

        const permissions = await getContactsWorkspacePermissions(wsId);
        if (!permissions) {
          return <ApprovalsUnavailableGate />;
        }

        const canApproveReports =
          permissions.containsPermission('approve_reports');
        const canApprovePosts = permissions.containsPermission('approve_posts');

        if (!(canApproveReports || canApprovePosts)) {
          return <ApprovalsForbiddenGate />;
        }

        const t = await getTranslations('approvals');

        return (
          <div className="container mx-auto px-4 py-6 md:px-8">
            <div className="space-y-2">
              <h1 className="font-semibold text-2xl">{t('title')}</h1>
              <p className="text-muted-foreground text-sm">
                {t('description')}
              </p>
            </div>
            <div className="mt-6">
              <ApprovalsClient
                canApprovePosts={canApprovePosts}
                canApproveReports={canApproveReports}
                wsId={wsId}
              />
            </div>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
