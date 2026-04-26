import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import ModelsClient from './models-client';
import { MODELS_PAGE_SIZE } from './models-constants';

export async function generateMetadata() {
  const t = await getTranslations('marketing-models');

  return {
    title: t('title'),
    description: t('subtitle'),
  };
}

export default async function ModelsPage() {
  const sbAdmin = await createAdminClient();

  const {
    data: models,
    error,
    count,
  } = await sbAdmin
    .from('ai_gateway_models')
    .select('*', { count: 'exact' })
    .order('provider')
    .order('name')
    .range(0, MODELS_PAGE_SIZE - 1);

  const { data: filterRows, error: filterError } = await sbAdmin
    .from('ai_gateway_models')
    .select('provider, tags, type')
    .order('provider')
    .order('type');

  if (error) {
    console.error('Failed to fetch models for public page', error);
  }

  if (filterError) {
    console.error('Failed to fetch model filters for public page', filterError);
  }

  const providers = Array.from(
    new Set((filterRows ?? []).map((row) => row.provider))
  ).sort();
  const types = Array.from(new Set((filterRows ?? []).map((row) => row.type)))
    .filter((type): type is string => Boolean(type))
    .sort();
  const tags = Array.from(
    new Set((filterRows ?? []).flatMap((row) => row.tags ?? []))
  ).sort((a, b) => a.localeCompare(b));

  return (
    <ModelsClient
      filterOptions={{ providers, tags, types }}
      initialPage={{
        data: models ?? [],
        pagination: { limit: MODELS_PAGE_SIZE, page: 1, total: count ?? 0 },
      }}
    />
  );
}
