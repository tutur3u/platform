'use client';

import { WorkspaceApprovalRequest } from './approvals-table';
import { Row } from '@tanstack/react-table';
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
import { useState } from 'react';
import { toast } from 'sonner';

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

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/education-access-requests/${approval.id}`,
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
          `Approved education access for ${approval.workspace_name}. Education features will be enabled automatically.`
        );
        setShowApproveDialog(false);
        setAdminNotes('');
        onRefresh?.();
      } else {
        toast.error(data.error || 'Failed to approve request');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      toast.error('Failed to approve request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!adminNotes.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/education-access-requests/${approval.id}`,
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
          `Rejected education access request for ${approval.workspace_name}`
        );
        setShowRejectDialog(false);
        setAdminNotes('');
        onRefresh?.();
      } else {
        toast.error(data.error || 'Failed to reject request');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast.error('Failed to reject request');
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
              Education Access Request Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Workspace Info */}
            <div className="flex items-center gap-4 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dynamic-blue text-white">
                <BookOpenText className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {approval.workspace_name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Workspace ID: {approval.workspace_id}
                </p>
              </div>
            </div>

            {/* Requester Info */}
            <div className="space-y-3">
              <h4 className="font-medium">Requested By</h4>
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
                    <div className="text-sm text-muted-foreground">
                      {approval.creator_email}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Request Details */}
            <div className="space-y-3">
              <h4 className="font-medium">Request Message</h4>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                {approval.request_message}
              </div>
            </div>

            {/* Status & Timeline */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Status</h4>
                <Badge
                  variant="secondary"
                  className={cn('capitalize', getStatusColor(approval.status))}
                >
                  {approval.status}
                </Badge>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Timeline</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Requested{' '}
                      {moment(approval.created_at).format('MMM DD, YYYY')}
                    </span>
                  </div>
                  {approval.reviewed_at && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>
                        Reviewed{' '}
                        {moment(approval.reviewed_at).format('MMM DD, YYYY')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Admin Notes */}
            {approval.admin_notes && (
              <div className="space-y-3">
                <h4 className="font-medium">Admin Notes</h4>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  {approval.admin_notes}
                </div>
                {approval.reviewed_by_name && (
                  <p className="text-xs text-muted-foreground">
                    Notes by {approval.reviewed_by_name}
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
              Close
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
              Approve Education Access
            </DialogTitle>
            <DialogDescription>
              This will enable education features for "{approval.workspace_name}
              " and grant the workspace access to all educational tools.
              {approval.status === 'rejected' &&
                ' This will override the previous rejection.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="approve-notes">Admin Notes (Optional)</Label>
              <Textarea
                id="approve-notes"
                placeholder="Add any notes about this approval..."
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
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isLoading}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Approve Request
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
              Reject Education Access
            </DialogTitle>
            <DialogDescription>
              This will reject the education access request for "
              {approval.workspace_name}". Please provide a reason for the
              rejection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-notes">Reason for Rejection *</Label>
              <Textarea
                id="reject-notes"
                placeholder="Please explain why this request is being rejected..."
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
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isLoading || !adminNotes.trim()}
              variant="destructive"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Reject Request
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
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowDetailsDialog(true)}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
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
                Approve Request
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowRejectDialog(true)}
                disabled={isLoading}
                className="text-red-600 focus:text-red-600"
              >
                <X className="mr-2 h-4 w-4" />
                Reject Request
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
                  Revoke Access
                </DropdownMenuItem>
              )}
              {approval.status === 'rejected' && (
                <DropdownMenuItem
                  onClick={() => setShowApproveDialog(true)}
                  disabled={isLoading}
                  className="text-green-600 focus:text-green-600"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Approve Request
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
