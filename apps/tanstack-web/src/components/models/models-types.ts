import type { GatewayModelRowsPage } from '@tuturuuu/internal-api';

export const MODELS_PAGE_SIZE = 60;

export type ModelsMessages = {
  all_providers: string;
  all_tags: string;
  all_types: string;
  context_window_label: string;
  filter_provider: string;
  filter_tag: string;
  filter_type: string;
  free: string;
  generation_price_label: string;
  input_price_label: string;
  load_failed: string;
  load_more: string;
  loading_more: string;
  max_output_label: string;
  no_results: string;
  not_available: string;
  output_price_label: string;
  per_image: string;
  search_placeholder: string;
  showing_count: string;
  subtitle: string;
  title: string;
  view_grid: string;
  view_list: string;
  view_mode: string;
};

export type ModelFilterOptions = {
  providers: string[];
  tags: string[];
  types: string[];
};

export type FetchModelsPageInput = {
  page: number;
  provider: string;
  search: string;
  tag: string;
  type: string;
};

export type FetchModelsPage = (
  input: FetchModelsPageInput
) => Promise<GatewayModelRowsPage>;
