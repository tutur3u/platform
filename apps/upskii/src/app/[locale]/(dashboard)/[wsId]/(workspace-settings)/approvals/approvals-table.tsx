'use client';

import { Button } from '@tuturuuu/ui/button';
import { AlertCircle, RefreshCw } from '@tuturuuu/ui/icons';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CustomDataTable } from '@/components/custom-data-table';
import { approvalsColumns } from './columns';
import { FeatureFilter } from './feature-filter';
import { StatusFilter } from './status-filter';

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

  const t = useTranslations('approval-data-table');

  // Get current search parameters
  const status = searchParams.get('status') || undefined;
  const feature = searchParams.get('feature') || undefined;
  const q = searchParams.get('q') || undefined;
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';

  // Fetch feature access requests
  const fetchApprovals = useCallback(
    async (showRefreshLoader = false) => {
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
        if (feature && feature !== 'all') queryParams.set('feature', feature);

        const response = await fetch(
          `/api/v1/admin/feature-requests?${queryParams.toString()}`,
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
        console.error('Error fetching feature access requests:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch requests';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [q, page, pageSize, status, feature]
  );

  // Fetch data when dependencies change
  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchApprovals(true);
  };

  // Handle bulk actions

  // Get feature statistics
  const getFeatureStats = () => {
    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      total: 0,
    };

    approvals.data.forEach((request) => {
      stats[request.status]++;
      stats.total++;
    });

    return stats;
  };

  const stats = getFeatureStats();

  // Show loading state
  if (isLoading && !isRefreshing) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>{t('loading')}</span>
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
          {t('try-again')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{t('loading')}</span>
          </div>
        )}
      </div>
      {/* Statistics and Controls */}
      <div className="mb-3 space-y-4">
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold text-foreground">
              {stats.total}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('total-requests')}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {stats.pending}
            </div>
            <div className="text-sm text-muted-foreground">{t('pending')}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold text-green-600">
              {stats.approved}
            </div>
            <div className="text-sm text-muted-foreground">{t('approved')}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-2xl font-bold text-red-600">
              {stats.rejected}
            </div>
            <div className="text-sm text-muted-foreground">{t('rejected')}</div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4">
          <StatusFilter currentStatus={status} />
          <FeatureFilter currentFeature={feature} />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isLoading && (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>{t('loading')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <CustomDataTable
        data={approvals.data}
        columnGenerator={(t, namespace) =>
          approvalsColumns(t, namespace, handleRefresh)
        }
        count={approvals.count}
        namespace="approval-data-table"
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </div>
  );
}
