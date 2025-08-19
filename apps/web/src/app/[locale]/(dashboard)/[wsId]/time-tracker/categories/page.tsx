import { CategoryManager } from '../components/category-manager';
import type { TimeTrackerData } from '../types';
import { getTimeTrackingData } from '@/lib/time-tracking-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TimeTrackerCategoriesPage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  try {
    const workspace = await getWorkspace(wsId);
    const user = await getCurrentUser();

    if (!workspace || !user) notFound();

    const rawData = await getTimeTrackingData(wsId, user.id);

    // Transform data to match expected types
    const initialData: TimeTrackerData = { ...rawData };

    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Time Tracking Categories</h1>
          <p className="text-muted-foreground">
            Manage your time tracking categories and tags
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
  } catch (error) {
    console.error('Error loading time tracker categories:', error);
    notFound();
  }
}
