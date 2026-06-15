'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye, Link2, Loader2, UserPen } from '@tuturuuu/icons';
import {
  repairWorkspaceUserPlatformLinks,
  type WorkspaceUserPlatformLinkRepairSkipReason,
} from '@tuturuuu/internal-api/users';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequestProfileDetailsDialog } from './components/request-profile-details-dialog';
import UserForm from './form';
import { canShowPlatformLinkRepairAction } from './platform-link-repair-visibility';
import { UserFeedbackDialog } from './user-feedback-dialog';

interface UserRowActionsProps {
  row: Row<WorkspaceUser>;
  href?: string;
  extraData?: Record<string, unknown>;
}

function getRepairReasonKey(reason: WorkspaceUserPlatformLinkRepairSkipReason) {
  switch (reason) {
    case 'already_linked':
      return 'ws-users.platform_link_repair_reason_already_linked';
    case 'ambiguous_platform_match':
      return 'ws-users.platform_link_repair_reason_ambiguous_platform_match';
    case 'ambiguous_workspace_profile':
      return 'ws-users.platform_link_repair_reason_ambiguous_workspace_profile';
    case 'missing_email':
      return 'ws-users.platform_link_repair_reason_missing_email';
    case 'no_member_match':
      return 'ws-users.platform_link_repair_reason_no_member_match';
    case 'platform_already_linked':
      return 'ws-users.platform_link_repair_reason_platform_already_linked';
  }
}

export function UserRowActions({ row, href, extraData }: UserRowActionsProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const pathname = usePathname();

  const user = row.original;
  const showPlatformLinkRepair = canShowPlatformLinkRepairAction(
    user,
    extraData
  );
  const showTrailingActions =
    (pathname.includes('/users/database') && !!extraData?.canDeleteUsers) ||
    !!(extraData?.wsId && extraData?.groupId);
  const [open, setOpen] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showProfileLinkDialog, setShowProfileLinkDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const canManageProfileLinks =
    !!extraData?.canManageUserProfileLinks && !!user.ws_id;

  const handleFormSuccess = () => {
    toast.success(t('ws-members.member-updated'), {
      description: `"${user?.display_name || user?.full_name || 'Unknown'}" ${t(
        'ws-members.has-been-updated'
      )}`,
    });
    setOpen(false);
    queryClient.invalidateQueries({
      queryKey: ['workspace-users', user.ws_id],
    });
  };

  const handleFormError = (error: string) => {
    toast.error(t('ws-members.error'), {
      description: error,
    });
  };

  const repairPlatformLinkMutation = useMutation({
    mutationFn: () =>
      repairWorkspaceUserPlatformLinks(user.ws_id!, {
        workspaceUserId: user.id,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-users', user.ws_id],
      });

      if (result.linked.length > 0) {
        toast.success(t('ws-users.platform_link_repair_success_single'), {
          description: t('ws-users.platform_link_repair_result_summary', {
            linked: result.summary.linked,
            skipped: result.summary.skipped,
          }),
        });
        return;
      }

      const skipped = result.skipped[0];
      toast.warning(t('ws-users.platform_link_repair_skipped_single'), {
        description: skipped
          ? t(getRepairReasonKey(skipped.reason))
          : t('ws-users.platform_link_repair_no_links'),
      });
    },
    onError: (error) => {
      toast.error(t('ws-users.platform_link_repair_failed'), {
        description:
          error instanceof Error
            ? error.message
            : t('ws-users.platform_link_repair_failed_description'),
      });
    },
  });

  const deleteUser = async () => {
    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/v1/workspaces/${user.ws_id}/users/${user.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('ws-users.delete_success'));
        setShowDeleteDialog(false);
        queryClient.invalidateQueries({
          queryKey: ['workspace-users', user.ws_id],
        });
      } else {
        const data = await res.json();
        toast.error(t('ws-users.failed_delete'), {
          description: data.message,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error(t('common.error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const removeUserFromGroup = async ({
    wsId,
    groupId,
    userId,
  }: {
    wsId: string;
    groupId: string;
    userId: string;
  }) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${userId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      queryClient.invalidateQueries({
        queryKey: ['workspace-users', wsId],
      });
    } else {
      const resData = await res.json();
      toast.error(t('common.error'), {
        description: resData.message,
      });
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {href && !!(extraData?.hasPublicInfo || extraData?.hasPrivateInfo) && (
        <Link href={href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[80vh] max-w-4xl overflow-y-scroll"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('ws-members.member-settings')}</DialogTitle>
            <DialogDescription>
              {t('ws-members.delete-member-description')}
            </DialogDescription>
          </DialogHeader>

          <UserForm
            wsId={user.ws_id!}
            data={user}
            onSuccess={handleFormSuccess}
            onError={handleFormError}
            showUserID={true}
          />
        </DialogContent>
      </Dialog>

      {!!extraData?.canViewFeedbacks && (
        <UserFeedbackDialog
          open={showFeedbackDialog}
          onOpenChange={setShowFeedbackDialog}
          wsId={user.ws_id!}
          user={user}
          canManageFeedbacks={!!extraData?.canManageFeedbacks}
        />
      )}

      {canManageProfileLinks && (
        <RequestProfileDetailsDialog
          wsId={user.ws_id!}
          mode="per_user"
          targetUserId={user.id}
          open={showProfileLinkDialog}
          onOpenChange={setShowProfileLinkDialog}
        />
      )}

      {!extraData?.canUpdateUsers &&
      !extraData?.canDeleteUsers &&
      !extraData?.canViewFeedbacks &&
      !canManageProfileLinks ? null : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {!!extraData?.canUpdateUsers && (
              <DropdownMenuItem onClick={() => setOpen(true)}>
                {t('common.edit')}
              </DropdownMenuItem>
            )}

            {!!extraData?.canViewFeedbacks && (
              <DropdownMenuItem onClick={() => setShowFeedbackDialog(true)}>
                {t('ws-users.feedback_support_action')}
              </DropdownMenuItem>
            )}

            {canManageProfileLinks && (
              <DropdownMenuItem onClick={() => setShowProfileLinkDialog(true)}>
                <UserPen className="mr-2 h-4 w-4" />
                {t('ws-user-profile-links.row_action')}
              </DropdownMenuItem>
            )}

            {showPlatformLinkRepair ? (
              <DropdownMenuItem
                onClick={() => repairPlatformLinkMutation.mutate()}
                disabled={repairPlatformLinkMutation.isPending}
              >
                {repairPlatformLinkMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                {t('ws-users.platform_link_repair_row_action')}
              </DropdownMenuItem>
            ) : null}

            {showTrailingActions ? <DropdownMenuSeparator /> : null}
            {pathname.includes('/users/database') &&
              !!extraData?.canDeleteUsers && (
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={!user.id || !user.ws_id}
                >
                  {t('common.delete')}
                </DropdownMenuItem>
              )}
            {!!(extraData?.wsId && extraData?.groupId) && (
              <DropdownMenuItem
                onClick={() =>
                  removeUserFromGroup({
                    wsId: extraData.wsId as string,
                    groupId: extraData.groupId as string,
                    userId: user.id,
                  })
                }
                disabled={!user.id || !user.ws_id}
              >
                {t('user-data-table.remove-from-group')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {!!extraData?.canDeleteUsers && (
        <AlertDialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            if (!isDeleting) {
              setShowDeleteDialog(open);
            }
          }}
        >
          <AlertDialogContent
            onEscapeKeyDown={(e) => isDeleting && e.preventDefault()}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{t('ws-users.delete')}</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  {t('ws-users.delete_confirmation')}
                </span>
                <span className="block font-semibold text-destructive">
                  {t('ws-users.delete_warning')}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                {t('common.cancel')}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={deleteUser}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.deleting')}
                  </>
                ) : (
                  t('common.delete')
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
