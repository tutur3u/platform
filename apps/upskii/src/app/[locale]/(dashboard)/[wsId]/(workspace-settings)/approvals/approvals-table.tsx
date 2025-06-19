'use client';

import { approvalsColumns } from './columns';
import { StatusFilter } from './status-filter';
import { CustomDataTable } from '@/components/custom-data-table';
import { Button } from '@tuturuuu/ui/button';
import { AlertCircle, RefreshCw } from '@tuturuuu/ui/icons';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ApprovalData {
  data: WorkspaceApprovalRequest[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WorkspaceApprovalRequest {
  id: string;
  workspace_id: string;
  workspace_name: string;
  creator_id: string;
  creator_name: string;
  creator_email?: string;
  creator_avatar?: string;
  feature_requested: string;
  request_message: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export function ApprovalsTable() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalData>({
    data: [],
    count: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  });

  // Get current search parameters
  const status = searchParams.get('status') || undefined;
  const q = searchParams.get('q') || undefined;
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';

  // Fetch education access requests
  const fetchApprovals = async (showRefreshLoader = false) => {
    try {
      if (showRefreshLoader) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (q) queryParams.set('q', q);
      if (page) queryParams.set('page', page);
      if (pageSize) queryParams.set('pageSize', pageSize);
      if (status && status !== 'all') queryParams.set('status', status);

      const response = await fetch(
        `/api/v1/admin/education-access-requests?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      setApprovals(data);
    } catch (error) {
      console.error('Error fetching education access requests:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch requests';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch data when dependencies change
  useEffect(() => {
    fetchApprovals();
  }, [status, q, page, pageSize]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchApprovals(true);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !isLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span>Error: {error}</span>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isLoading && (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading requests...</span>
            </>
          )}
          {!isLoading && (
            <span>
              {approvals.count} total request{approvals.count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            variant="outline"
            size="sm"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <StatusFilter currentStatus={status} />
        </div>
      </div>

      <CustomDataTable
        data={approvals.data}
        columnGenerator={(t, namespace) =>
          approvalsColumns(t, namespace, handleRefresh)
        }
        count={approvals.count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </div>
  );
}
