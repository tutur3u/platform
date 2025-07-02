import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Workspace } from '@tuturuuu/types/db';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ClientSideMarketingPage from './client-side-page';
import LoadingState from './loading-state';

export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

export type Testimonial = {
  name: string;
  avatar: string | null;
  stars: number;
  quote: string;
  course: string | null;
};

export default async function MarketingPage() {
  const workspaces = await getWorkspaces();
  const testimonials = await getTestimonials();

  return (
    <Suspense fallback={<LoadingState />}>
      <ClientSideMarketingPage
        testimonials={testimonials}
        workspaces={workspaces}
      />
    </Suspense>
  );
}

async function getTestimonials(): Promise<Testimonial[]> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('testimonials')
    .select(
      '*, users!user_id(display_name, avatar_url), workspace_courses!course_id(name)'
    )
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    return [];
  }

  return (data || []).map((testimonial) => ({
    name: testimonial.users?.display_name || 'Anonymous',
    avatar: testimonial.users?.avatar_url || null,
    stars: typeof testimonial.rating === 'number' ? testimonial.rating : 0,
    quote: testimonial.content || '',
    course: testimonial.workspace_courses?.name || null,
  }));
}

async function getWorkspaces() {
  const response = await fetch('/api/v1/workspaces');
  if (!response.ok) notFound();

  const data = await response.json();
  return data as Workspace[];
}
