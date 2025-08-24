import { createClient } from '@tuturuuu/supabase/next/server';
import { CategoryManager } from '../components/category-manager';

export default async function TimeTrackerCategoriesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from('time_tracking_categories')
    .select('*')
    .eq('ws_id', wsId);

  return <CategoryManager wsId={wsId} categories={categories} />;
}
