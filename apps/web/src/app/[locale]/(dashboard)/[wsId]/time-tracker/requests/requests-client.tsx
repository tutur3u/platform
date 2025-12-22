'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AllRequestsView } from './components/all-requests-view';
import { MyRequestsView } from './components/my-requests-view';
import type { ExtendedTimeTrackingRequest } from './page';
import { RequestDetailModal } from './request-detail-modal';

interface RequestsClientProps {
  wsId: string;
  bypassRulesPermission: boolean;
  currentUser: WorkspaceUser | null;
  canManageTimeTrackingRequests: boolean;
}

export function RequestsClient({
  wsId,
  bypassRulesPermission,
  currentUser,
  canManageTimeTrackingRequests,
}: RequestsClientProps) {
  const t = useTranslations('time-tracker.requests');
  const [selectedRequest, setSelectedRequest] =
    useState<ExtendedTimeTrackingRequest | null>(null);

  const [activeTab, setActiveTab] = useState(
    canManageTimeTrackingRequests ? 'all' : 'my'
  );

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="all" disabled={!canManageTimeTrackingRequests}>
            {t('tabs.all')}
          </TabsTrigger>
          <TabsTrigger value="my">{t('tabs.my')}</TabsTrigger>
        </TabsList>

        {canManageTimeTrackingRequests && (
          <TabsContent value="all">
            <AllRequestsView
              wsId={wsId}
              bypassRulesPermission={bypassRulesPermission}
              currentUser={currentUser}
              onSelectRequest={setSelectedRequest}
            />
          </TabsContent>
        )}

        <TabsContent value="my">
          <MyRequestsView
            wsId={wsId}
            bypassRulesPermission={bypassRulesPermission}
            currentUser={currentUser}
            onSelectRequest={setSelectedRequest}
          />
        </TabsContent>
      </Tabs>

      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          isOpen={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onUpdate={() => {
            setSelectedRequest(null);
          }}
          wsId={wsId}
          bypassRulesPermission={bypassRulesPermission}
          currentUser={currentUser}
        />
      )}
    </>
  );
}
