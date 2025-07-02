'use client';

import type { Row } from '@tanstack/react-table';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  BookOpenText,
  Calendar,
  Check,
  Clock,
  Ellipsis,
  Eye,
  Loader2,
  User,
  X,
} from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import type { WorkspaceApprovalRequest } from './approvals-table';

interface ApprovalRowActionsProps {
  row: Row<WorkspaceApprovalRequest>;
  onRefresh?: () => void;
}

export function ApprovalRowActions({
  row,
  onRefresh,
}: ApprovalRowActionsProps) {
  const approval = row.original;
  const [isLoading, setIsLoading] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const t = useTranslations('approval-data-table');

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/feature-requests/${approval.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'approved',
            admin_notes: adminNotes.trim() || undefined,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(
          t('approveSuccess', {
            feature: approval.feature_requested,
            workspace: approval.workspace_name,
          })
        );
        setShowApproveDialog(false);
        setAdminNotes('');
        onRefresh?.();
      } else {
        toast.error(data.error || t('approveError'));
      }
    } catch (error) {
      console.error('Error approving request:', error);
      toast.error(t('approveError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!adminNotes.trim()) {
      toast.error(t('rejectError'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/feature-requests/${approval.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'rejected',
            admin_notes: adminNotes.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(
          t('rejectSuccess', {
            feature: approval.feature_requested,
            workspace: approval.workspace_name,
          })
        );
        setShowRejectDialog(false);
        setAdminNotes('');
        onRefresh?.();
      } else {
        toast.error(data.error || t('rejectError'));
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast.error(t('rejectError'));
    } finally {
      setIsLoading(false);
    }
  };

  const isPending = approval.status === 'pending';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'approved':
        return 'border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'rejected':
        return 'border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400';
      default:
        return ' bg-gray-100 text-gray-800 dark:border-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <>
      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpenText className="h-5 w-5 text-dynamic-blue" />
              {t('detailsTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Workspace Info */}
            <div className="flex items-center gap-4 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-blue text-white">
                <BookOpenText className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">
                  {approval.workspace_name}
                </h3>
                <p className="text-muted-foreground text-sm">
                  Workspace ID: {approval.workspace_id}
                </p>
              </div>
            </div>

            {/* Feature Info */}

            {/* Requester Info */}
            <div className="space-y-3">
              <h4 className="font-medium">{t('requestedBy')}</h4>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={approval.creator_avatar}
                    alt={approval.creator_name}
                  />
                  <AvatarFallback className="bg-dynamic-blue/10 text-dynamic-blue">
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{approval.creator_name}</div>
                  {approval.creator_email && (
                    <div className="text-muted-foreground text-sm">
                      {approval.creator_email}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Request Details */}
            <div className="space-y-3">
              <h4 className="font-medium">{t('request_message')}</h4>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                {approval.request_message}
              </div>
            </div>

            {/* Status & Timeline */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">{t('status')}</h4>
                <Badge
                  variant="secondary"
                  className={cn('capitalize', getStatusColor(approval.status))}
                >
                  {approval.status}
                </Badge>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">{t('timeline')}</h4>
                <div className="space-y-1 text-muted-foreground text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {t('requested_at', {
                        date: moment(approval.created_at).format(
                          'MMM DD, YYYY'
                        ),
                      })}
                    </span>
                  </div>
                  {approval.reviewed_at && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>
                        {t('reviewed_at', {
                          date: moment(approval.reviewed_at).format(
                            'MMM DD, YYYY'
                          ),
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Admin Notes */}
            {approval.admin_notes && (
              <div className="space-y-3">
                <h4 className="font-medium">{t('adminNotes')}</h4>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  {approval.admin_notes}
                </div>
                {approval.reviewed_by_name && (
                  <p className="text-muted-foreground text-xs">
                    {t('notesBy', {
                      name: approval.reviewed_by_name,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDetailsDialog(false)}
            >
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              {t('approveTitle', {
                feature: approval.feature_requested,
              })}
            </DialogTitle>
            <DialogDescription>
              {t('approveDescription', {
                feature: approval.feature_requested,
                workspace: approval.workspace_name,
              })}
              {approval.status === 'rejected' && t('approveOverride')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="approve-notes">{t('adminNotes')}</Label>
              <Textarea
                id="approve-notes"
                placeholder={t('adminNotesPlaceholder')}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowApproveDialog(false);
                setAdminNotes('');
              }}
              disabled={isLoading}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isLoading}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('approving')}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {t('approveRequest')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="h-5 w-5" />
              {t('rejectTitle', {
                feature: approval.feature_requested,
              })}
            </DialogTitle>
            <DialogDescription>
              {t('rejectDescription', {
                feature: approval.feature_requested,
                workspace: approval.workspace_name,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-notes">{t('reasonForRejection')}</Label>
              <Textarea
                id="reject-notes"
                placeholder={t('reasonForRejectionPlaceholder')}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setAdminNotes('');
              }}
              disabled={isLoading}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleReject}
              disabled={isLoading || !adminNotes.trim()}
              variant="destructive"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('rejecting')}
                </>
              ) : (
                <>
                  <X className="mr-2 h-4 w-4" />
                  {t('rejectRequest')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dropdown Menu */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">{t('openMenu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowDetailsDialog(true)}>
            <Eye className="mr-2 h-4 w-4" />
            {t('viewDetails')}
          </DropdownMenuItem>

          {isPending && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowApproveDialog(true)}
                disabled={isLoading}
                className="text-green-600 focus:text-green-600"
              >
                <Check className="mr-2 h-4 w-4" />
                {t('approveRequest')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowRejectDialog(true)}
                disabled={isLoading}
                className="text-red-600 focus:text-red-600"
              >
                <X className="mr-2 h-4 w-4" />
                {t('rejectRequest')}
              </DropdownMenuItem>
            </>
          )}

          {!isPending && (
            <>
              <DropdownMenuSeparator />
              {approval.status === 'approved' && (
                <DropdownMenuItem
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isLoading}
                  className="text-red-600 focus:text-red-600"
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('revokeAccess')}
                </DropdownMenuItem>
              )}
              {approval.status === 'rejected' && (
                <DropdownMenuItem
                  onClick={() => setShowApproveDialog(true)}
                  disabled={isLoading}
                  className="text-green-600 focus:text-green-600"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {t('approveRequest')}
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
