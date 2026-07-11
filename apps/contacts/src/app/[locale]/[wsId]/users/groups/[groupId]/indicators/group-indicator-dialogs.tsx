'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type {
  GroupIndicator,
  MetricCategory,
} from '@tuturuuu/users-core/lib/group-indicators-types';
import type { ComponentProps } from 'react';
import {
  AddCategoryDialog,
  AddIndicatorDialog,
  EditIndicatorDialog,
} from './indicator-dialogs';
import UserFeedbackDialog from './user-feedback-dialog';

interface GroupIndicatorDialogsProps {
  addCategoryDialogOpen: boolean;
  addDialogOpen: boolean;
  canDelete: boolean;
  createCategoryMutation: ComponentProps<
    typeof AddCategoryDialog
  >['createMutation'];
  createVitalMutation: ComponentProps<
    typeof AddIndicatorDialog
  >['createMutation'];
  deleteIndicatorMutation: ComponentProps<
    typeof EditIndicatorDialog
  >['deleteMutation'];
  editDialogOpen: boolean;
  feedbackDialogOpen: boolean;
  groupId: string;
  groupName: string;
  isAnyMutationPending: boolean;
  metricCategories: MetricCategory[];
  selectedIndicator: GroupIndicator | null;
  selectedUser: WorkspaceUser | null;
  setAddCategoryDialogOpen: (open: boolean) => void;
  setAddDialogOpen: (open: boolean) => void;
  setEditDialogOpen: (open: boolean) => void;
  setFeedbackDialogOpen: (open: boolean) => void;
  updateIndicatorMutation: ComponentProps<
    typeof EditIndicatorDialog
  >['updateMutation'];
  wsId: string;
}

export function GroupIndicatorDialogs({
  addCategoryDialogOpen,
  addDialogOpen,
  canDelete,
  createCategoryMutation,
  createVitalMutation,
  deleteIndicatorMutation,
  editDialogOpen,
  feedbackDialogOpen,
  groupId,
  groupName,
  isAnyMutationPending,
  metricCategories,
  selectedIndicator,
  selectedUser,
  setAddCategoryDialogOpen,
  setAddDialogOpen,
  setEditDialogOpen,
  setFeedbackDialogOpen,
  updateIndicatorMutation,
  wsId,
}: GroupIndicatorDialogsProps) {
  return (
    <>
      <AddIndicatorDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        createMutation={createVitalMutation}
        metricCategories={metricCategories}
        isAnyMutationPending={isAnyMutationPending}
      />

      <AddCategoryDialog
        open={addCategoryDialogOpen}
        onOpenChange={setAddCategoryDialogOpen}
        createMutation={createCategoryMutation}
        isAnyMutationPending={isAnyMutationPending}
      />

      <EditIndicatorDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        indicator={selectedIndicator}
        updateMutation={updateIndicatorMutation}
        deleteMutation={deleteIndicatorMutation}
        metricCategories={metricCategories}
        canDelete={canDelete}
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
    </>
  );
}
