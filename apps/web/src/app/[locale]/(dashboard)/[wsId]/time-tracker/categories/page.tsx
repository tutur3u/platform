import { createClient } from '@tuturuuu/supabase/next/server';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { CategoryManager } from '../components/category-manager';

export default async function TimeTrackerCategoriesPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId: id } = await params;
  const supabase = await createClient();

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const { data: categories } = await supabase
    .from('time_tracking_categories')
    .select('*')
    .eq('ws_id', wsId);

  return <CategoryManager wsId={wsId} categories={categories} />;
}
