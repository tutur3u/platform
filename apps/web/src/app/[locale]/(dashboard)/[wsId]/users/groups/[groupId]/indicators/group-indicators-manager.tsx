'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { useMemo, useState } from 'react';
import { GroupIndicatorDialogs } from './group-indicator-dialogs';
import { IndicatorCategoryTabs } from './indicator-category-tabs';
import { IndicatorSaveBar } from './indicator-save-bar';
import { IndicatorSummaryStats } from './indicator-summary-stats';
import { IndicatorTable } from './indicator-table';
import { IndicatorToolbar } from './indicator-toolbar';
import type { GroupIndicator, MetricCategory, UserIndicator } from './types';
import { useIndicators } from './use-indicators';

interface Props {
  wsId: string;
  groupId: string;
  groupName: string;
  users: WorkspaceUser[];
  initialGroupIndicators: GroupIndicator[];
  initialMetricCategories: MetricCategory[];
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
  initialMetricCategories,
  initialUserIndicators,
  canCreateUserGroupsScores = false,
  canUpdateUserGroupsScores = false,
  canDeleteUserGroupsScores = false,
}: Props) {
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCategoryDialogOpen, setAddCategoryDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedCategoryView, setSelectedCategoryView] = useState('all');
  const [selectedIndicator, setSelectedIndicator] =
    useState<GroupIndicator | null>(null);
  const [selectedUser, setSelectedUser] = useState<WorkspaceUser | null>(null);

  const {
    groupIndicators,
    metricCategories,
    userIndicators,
    managerUserIds,
    createVitalMutation,
    createCategoryMutation,
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
    initialMetricCategories,
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

  const hasUncategorizedIndicators = useMemo(
    () =>
      groupIndicators.some((indicator) => indicator.categories.length === 0),
    [groupIndicators]
  );

  const visibleIndicators = useMemo(() => {
    if (selectedCategoryView === 'all') return groupIndicators;
    if (selectedCategoryView === 'uncategorized') {
      return groupIndicators.filter(
        (indicator) => indicator.categories.length === 0
      );
    }

    return groupIndicators.filter((indicator) =>
      indicator.categories.some(
        (category) => category.id === selectedCategoryView
      )
    );
  }, [groupIndicators, selectedCategoryView]);

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
      <IndicatorSaveBar
        show={hasChanges}
        disabled={isAnyMutationPending}
        isSubmitting={isSubmitting}
        onReset={handleReset}
        onSubmit={handleSubmit}
      />

      <div className="space-y-4">
        <IndicatorToolbar
          canCreate={canCreateUserGroupsScores}
          onAddCategoryClick={() => setAddCategoryDialogOpen(true)}
          onAddIndicatorClick={() => setAddDialogOpen(true)}
        />

        {(metricCategories.length > 0 || hasUncategorizedIndicators) && (
          <IndicatorCategoryTabs
            canDelete={canDeleteUserGroupsScores}
            groupId={groupId}
            hasUncategorizedIndicators={hasUncategorizedIndicators}
            metricCategories={metricCategories}
            value={selectedCategoryView}
            onValueChange={setSelectedCategoryView}
            wsId={wsId}
          />
        )}

        {visibleIndicators.length > 0 && (
          <IndicatorSummaryStats
            groupIndicators={visibleIndicators}
            userIndicators={userIndicators}
            userIds={displayedUserIds}
          />
        )}

        <IndicatorTable
          groupIndicators={visibleIndicators}
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

      <GroupIndicatorDialogs
        addCategoryDialogOpen={addCategoryDialogOpen}
        addDialogOpen={addDialogOpen}
        canDelete={canDeleteUserGroupsScores}
        createCategoryMutation={createCategoryMutation}
        createVitalMutation={createVitalMutation}
        deleteIndicatorMutation={deleteIndicatorMutation}
        editDialogOpen={editDialogOpen}
        feedbackDialogOpen={feedbackDialogOpen}
        groupId={groupId}
        groupName={groupName}
        isAnyMutationPending={isAnyMutationPending}
        metricCategories={metricCategories}
        selectedIndicator={selectedIndicator}
        selectedUser={selectedUser}
        setAddCategoryDialogOpen={setAddCategoryDialogOpen}
        setAddDialogOpen={setAddDialogOpen}
        setEditDialogOpen={setEditDialogOpen}
        setFeedbackDialogOpen={setFeedbackDialogOpen}
        updateIndicatorMutation={updateIndicatorMutation}
        wsId={wsId}
      />
    </div>
  );
}
