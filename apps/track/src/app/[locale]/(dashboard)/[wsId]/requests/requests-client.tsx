'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequestsView } from './components/requests-view';
import type { ExtendedTimeTrackingRequest } from './page';
import { RequestDetailModal } from './request-detail-modal';

interface RequestsClientProps {
  wsId: string;
  currentUser: WorkspaceUser | null;
  canManageTimeTrackingRequests: boolean;
  canBypassTimeTrackingRequestApproval: boolean;
}

export function RequestsClient({
  wsId,
  currentUser,
  canManageTimeTrackingRequests,
  canBypassTimeTrackingRequestApproval,
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
            <RequestsView
              wsId={wsId}
              currentUser={currentUser}
              onSelectRequest={setSelectedRequest}
              viewMode="all"
            />
          </TabsContent>
        )}

        <TabsContent value="my">
          <RequestsView
            wsId={wsId}
            onSelectRequest={setSelectedRequest}
            currentUser={currentUser}
            viewMode="my"
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
          canManageTimeTrackingRequests={canManageTimeTrackingRequests}
          canBypassTimeTrackingRequestApproval={
            canBypassTimeTrackingRequestApproval
          }
          currentUser={currentUser}
        />
      )}
    </>
  );
}
