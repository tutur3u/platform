'use client';

import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { CategoryManager } from '../components/category-manager';
import type { TimeTrackerData } from '../types';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default function TimeTrackerCategoriesPage({ params }: Props) {
  const router = useRouter();
  const [initialData, setInitialData] = useState<TimeTrackerData | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { wsId: id } = await params;
        const workspace = await getWorkspace(id);
        const currentWsId = workspace?.id;

        if (!currentWsId) {
          notFound();
          return;
        }

        const user = await getCurrentUser();
        if (!user) {
          notFound();
          return;
        }

        const rawData = await getTimeTrackingData(currentWsId, user.id);
        setInitialData({ ...rawData });
        setWsId(currentWsId);
      } catch (error) {
        console.error('Error loading time tracker categories:', error);
        notFound();
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [params]);

  if (loading || !initialData || !wsId) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="font-bold text-3xl">Time Tracking Categories</h1>
        <p className="text-muted-foreground">
          Manage your time tracking categories and tags
        </p>
      </div>
      <CategoryManager
        wsId={wsId}
        categories={initialData.categories || []}
        onCategoriesUpdate={() => {
          // Refresh data when categories are updated
          router.refresh();
        }}
        apiCall={async (url: string, options?: RequestInit) => {
          const response = await fetch(url, options);
          if (!response.ok) {
            throw new Error('Failed to update categories');
          }
          return response.json();
        }}
      />
    </div>
  );
}
