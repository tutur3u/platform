'use client';

import { WorkspaceApprovalRequest } from './page';
import { Row } from '@tanstack/react-table';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Check, Ellipsis, Eye, Loader2, X } from '@tuturuuu/ui/icons';
import { useState } from 'react';
import { toast } from 'sonner';

interface ApprovalRowActionsProps {
  row: Row<WorkspaceApprovalRequest>;
}

export function ApprovalRowActions({ row }: ApprovalRowActionsProps) {
  const approval = row.original;
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await mockApprovalAction(approval.id, 'approve');
      toast.success(`Approved feature request for ${approval.workspace_name}`);
      // Refresh the page or update the data
      window.location.reload();
    } catch (error) {
      toast.error('Failed to approve request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await mockApprovalAction(approval.id, 'reject');
      toast.success(`Rejected feature request for ${approval.workspace_name}`);
      // Refresh the page or update the data
      window.location.reload();
    } catch (error) {
      toast.error('Failed to reject request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = () => {
    // TODO: Open a modal or navigate to details page
    toast.info('Details view not implemented yet');
  };

  const isPending = approval.status === 'pending';

  if (isPending) {
    return (
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
          <DropdownMenuItem onClick={handleViewDetails}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleApprove}
            disabled={isLoading}
            className="text-green-600"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Approve Request
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleReject}
            disabled={isLoading}
            className="text-red-600"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            Reject Request
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // For approved/rejected requests, only show view details
  return (
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
        <DropdownMenuItem onClick={handleViewDetails}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        {approval.status === 'approved' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleReject}
              disabled={isLoading}
              className="text-red-600"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Revoke Access
            </DropdownMenuItem>
          </>
        )}
        {approval.status === 'rejected' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleApprove}
              disabled={isLoading}
              className="text-green-600"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve Request
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Mock function to simulate API calls
// TODO: Replace with actual API implementation
const mockApprovalAction = async (
  requestId: string,
  action: 'approve' | 'reject'
): Promise<void> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Simulate occasional failures for testing
  if (Math.random() < 0.1) {
    throw new Error(`Failed to ${action} request`);
  }

  console.log(`${action} request ${requestId}`);
};
