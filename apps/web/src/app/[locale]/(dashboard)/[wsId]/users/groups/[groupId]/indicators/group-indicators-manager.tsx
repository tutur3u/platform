'use client';

import { RotateCcw, Save } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AddIndicatorDialog, EditIndicatorDialog } from './indicator-dialogs';
import { IndicatorSummaryStats } from './indicator-summary-stats';
import { IndicatorTable } from './indicator-table';
import { IndicatorToolbar } from './indicator-toolbar';
import type { GroupIndicator, UserIndicator } from './types';
import { useIndicators } from './use-indicators';
import UserFeedbackDialog from './user-feedback-dialog';

interface Props {
  wsId: string;
  groupId: string;
  groupName: string;
  users: WorkspaceUser[];
  initialGroupIndicators: GroupIndicator[];
  initialUserIndicators: UserIndicator[];
  canCreateUserGroupsScores: boolean;
  canUpdateUserGroupsScores: boolean;
  canDeleteUserGroupsScores: boolean;
}

export default function GroupIndicatorsManager({
  wsId,
  groupId,
  groupName,
  users,
  initialGroupIndicators,
  initialUserIndicators,
  canCreateUserGroupsScores = false,
  canUpdateUserGroupsScores = false,
  canDeleteUserGroupsScores = false,
}: Props) {
  const t = useTranslations();

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedIndicator, setSelectedIndicator] =
    useState<GroupIndicator | null>(null);
  const [selectedUser, setSelectedUser] = useState<WorkspaceUser | null>(null);

  const {
    groupIndicators,
    userIndicators,
    managerUserIds,
    createVitalMutation,
    updateIndicatorMutation,
    deleteIndicatorMutation,
    handleValueChange,
    isValuePending,
    getIndicatorValue,
    calculateAverage,
    canEditCell,
    hasChanges,
    isAnyMutationPending,
    isSubmitting,
    handleReset,
    handleSubmit,
  } = useIndicators({
    wsId,
    groupId,
    initialGroupIndicators,
    initialUserIndicators,
    canCreate: canCreateUserGroupsScores,
    canUpdate: canUpdateUserGroupsScores,
    canDelete: canDeleteUserGroupsScores,
  });

  // Filter out managers from the displayed user list
  const displayedUsers = useMemo(
    () => users.filter((u) => !managerUserIds.has(u.id)),
    [users, managerUserIds]
  );

  // Set of displayed user IDs for accurate stats filtering
  const displayedUserIds = useMemo(
    () => new Set(displayedUsers.map((u) => u.id)),
    [displayedUsers]
  );

  const openEditDialog = (indicator: GroupIndicator) => {
    setSelectedIndicator(indicator);
    setEditDialogOpen(true);
  };

  const openFeedbackDialog = (user: WorkspaceUser) => {
    setSelectedUser(user);
    setFeedbackDialogOpen(true);
  };

  return (
    <div>
      <StickyBottomBar
        show={hasChanges}
        message={t('common.unsaved-changes')}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={isAnyMutationPending}
            >
              <RotateCcw className="h-4 w-4" />
              {t('common.reset')}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isAnyMutationPending}
              className={cn(
                'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
              )}
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <IndicatorToolbar
          canCreate={canCreateUserGroupsScores}
          onAddClick={() => setAddDialogOpen(true)}
        />

        {groupIndicators.length > 0 && (
          <IndicatorSummaryStats
            groupIndicators={groupIndicators}
            userIndicators={userIndicators}
            userIds={displayedUserIds}
          />
        )}

        <IndicatorTable
          groupIndicators={groupIndicators}
          users={displayedUsers}
          canUpdate={canUpdateUserGroupsScores}
          getIndicatorValue={getIndicatorValue}
          handleValueChange={handleValueChange}
          isValuePending={isValuePending}
          canEditCell={canEditCell}
          calculateAverage={calculateAverage}
          onEditIndicator={openEditDialog}
          onUserClick={openFeedbackDialog}
        />
      </div>

      <AddIndicatorDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        createMutation={createVitalMutation}
        isAnyMutationPending={isAnyMutationPending}
      />

      <EditIndicatorDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        indicator={selectedIndicator}
        updateMutation={updateIndicatorMutation}
        deleteMutation={deleteIndicatorMutation}
        canDelete={canDeleteUserGroupsScores}
        isAnyMutationPending={isAnyMutationPending}
      />

      <UserFeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        user={selectedUser}
        groupName={groupName}
        wsId={wsId}
        groupId={groupId}
      />
    </div>
  );
}
