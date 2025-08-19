'use client';

import { CategoryManager } from '../components/category-manager';
import type { TimeTrackerData } from '../types';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  params: {
    locale: string;
    wsId: string;
  };
}

export default function TimeTrackerCategoriesPage({ params }: Props) {
  const t = useTranslations();
  const [initialData, setInitialData] = useState<TimeTrackerData | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { wsId: id } = params;
        const workspace = await getWorkspace(id);

        if (!workspace) {
          notFound();
          return;
        }

        const user = await getCurrentUser();
        if (!user) {
          notFound();
          return;
        }

        const rawData = await getTimeTrackingData(workspace.id, user.id);
        setInitialData(rawData);
        setWsId(workspace.id);
      } catch (error) {
        console.error('Error loading time tracker categories:', error);
        // Only use notFound for genuine 404s, let other errors bubble up
        if (error instanceof Error && error.message.includes('not found')) {
          notFound();
        }
        throw error; // Let error boundary handle this
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
        <h1 className="text-3xl font-bold">
          {t('time_tracker_pages.categories.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('time_tracker_pages.categories.description')}
        </p>
      </div>
      <CategoryManager
        wsId={wsId}
        categories={initialData.categories || []}
        onCategoriesUpdate={() => {
          // Refresh data when categories are updated
          window.location.reload();
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
