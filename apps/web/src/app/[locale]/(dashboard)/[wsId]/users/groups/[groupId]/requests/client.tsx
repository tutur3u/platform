'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApprovalsView } from '../../../approvals/components/approvals-view';

interface GroupRequestsClientProps {
  wsId: string;
  groupId: string;
  canApproveReports: boolean;
  canApprovePosts: boolean;
}

export function GroupRequestsClient({
  wsId,
  groupId,
  canApproveReports,
  canApprovePosts,
}: GroupRequestsClientProps) {
  const t = useTranslations('approvals');
  const [activeTab, setActiveTab] = useState(
    canApproveReports ? 'reports' : 'posts'
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="reports" disabled={!canApproveReports}>
          {t('tabs.reports')}
        </TabsTrigger>
        <TabsTrigger value="posts" disabled={!canApprovePosts}>
          {t('tabs.posts')}
        </TabsTrigger>
      </TabsList>

      {canApproveReports && (
        <TabsContent value="reports">
          <ApprovalsView
            wsId={wsId}
            kind="reports"
            canApprove={canApproveReports}
            groupId={groupId}
            defaultStatus="all"
          />
        </TabsContent>
      )}

      {canApprovePosts && (
        <TabsContent value="posts">
          <ApprovalsView
            wsId={wsId}
            kind="posts"
            canApprove={canApprovePosts}
            groupId={groupId}
            defaultStatus="all"
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
