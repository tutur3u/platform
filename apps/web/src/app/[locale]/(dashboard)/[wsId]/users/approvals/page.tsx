import { Info } from '@tuturuuu/icons';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { ApprovalsClient } from './approvals-client';

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
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        const t = await getTranslations('approvals');

        if (isPersonal) {
          return (
            <div className="container mx-auto px-4 py-6 md:px-8">
              <div className="rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 p-4">
                <div className="flex">
                  <div className="shrink-0">
                    <Info
                      className="h-5 w-5 text-dynamic-blue"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ml-3">
                    <h3 className="font-medium text-dynamic-blue text-sm">
                      {t('personal.title')}
                    </h3>
                    <p className="mt-1 text-dynamic-blue text-sm">
                      {t('personal.description')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        const { containsPermission } = await getPermissions({ wsId });
        const canApproveReports = containsPermission('approve_reports');
        const canApprovePosts = containsPermission('approve_posts');

        if (!canApproveReports && !canApprovePosts) {
          notFound();
        }

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
                wsId={wsId}
                canApproveReports={canApproveReports}
                canApprovePosts={canApprovePosts}
              />
            </div>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
