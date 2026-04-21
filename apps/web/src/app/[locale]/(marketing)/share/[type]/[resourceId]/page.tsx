import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseViewer } from './course-viewer';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{
    type: string;
    resourceId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, resourceId } = await params;

  if (type !== 'course') {
    return { title: 'Shared Content' };
  }

  const sbAdmin = await createAdminClient();
  const { data: group } = await sbAdmin
    .from('workspace_user_groups')
    .select('name')
    .eq('id', resourceId)
    .maybeSingle();

  return {
    title: group?.name ? `${group.name} – Course Content` : 'Course Content',
    description: `View the shared course content for ${group?.name ?? 'this group'}.`,
  };
}

export default async function SharePage({ params }: Props) {
  const { type, resourceId } = await params;

  // Only support 'course' type for now
  if (type !== 'course') notFound();

  // Fetch from the internal API route
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:7803';
  const res = await fetch(`${appUrl}/api/share/${type}/${resourceId}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    if (res.status === 404) notFound();
    throw new Error('Failed to fetch shared content');
  }

  const { group, modules: publishedModules } = await res.json();

  return <CourseViewer group={group} modules={publishedModules} />;
}
