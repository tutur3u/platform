import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Suspense } from 'react';
import ClientSideMarketingPage from './client-side-page';
import LoadingState from './loading-state';

export const dynamic = 'force-static';
export const revalidate = 60 * 60 * 24; // 24 hours

export type Testimonial = {
  name: string;
  avatar: string | null;
  stars: number;
  quote: string;
  course: string | null;
};

export default async function MarketingPage() {
  const testimonials = await getTestimonials();

  return (
    <Suspense fallback={<LoadingState />}>
      <ClientSideMarketingPage testimonials={testimonials} />
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
