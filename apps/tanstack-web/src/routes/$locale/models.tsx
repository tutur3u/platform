import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import type {
  GatewayModelRow,
  GatewayModelRowsPage,
  ListAiGatewayModelsPageParams,
} from '@tuturuuu/internal-api';
import {
  listAiGatewayModelRows,
  listAiGatewayModelRowsPage,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api';
import { ModelsPage } from '../../components/models/models-page';
import type {
  FetchModelsPageInput,
  ModelFilterOptions,
} from '../../components/models/models-types';
import { MODELS_PAGE_SIZE } from '../../components/models/models-types';
import { withTanstackBackendRuntime } from '../../lib/cloudflare/backend';
import {
  MODEL_DIRECTORY_FALLBACK_CACHE_HEADERS,
  PUBLIC_MODEL_DIRECTORY_CACHE_HEADERS,
} from '../../lib/platform/cache';
import { createPageHead } from '../../lib/platform/head';
import {
  getMessages,
  resolveMessagesLocale,
} from '../../lib/platform/messages';

type ModelsDirectoryData = {
  cacheState: 'backend-fallback' | 'public';
  filterOptions: ModelFilterOptions;
  initialPage: GatewayModelRowsPage;
};

const EMPTY_MODELS_DIRECTORY: ModelsDirectoryData = {
  cacheState: 'backend-fallback',
  filterOptions: {
    providers: [],
    tags: [],
    types: [],
  },
  initialPage: {
    data: [],
    pagination: {
      limit: MODELS_PAGE_SIZE,
      page: 1,
      total: 0,
    },
  },
};

const modelTypes = new Set(['all', 'embedding', 'image', 'language']);

function normalizeModelType(
  value: string
): ListAiGatewayModelsPageParams['type'] {
  return modelTypes.has(value)
    ? (value as ListAiGatewayModelsPageParams['type'])
    : 'all';
}

function optionalFilter(value: string) {
  const trimmed = value.trim();
  return trimmed && trimmed !== 'all' ? trimmed : undefined;
}

function optionalSearch(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function backendApiOptions() {
  return withForwardedBackendApiAuth(
    getRequestHeaders(),
    await withTanstackBackendRuntime()
  );
}

function filterOptionsFromRows(rows: GatewayModelRow[]): ModelFilterOptions {
  const providers = new Set<string>();
  const tags = new Set<string>();
  const types = new Set<string>();

  for (const row of rows) {
    providers.add(row.provider);

    if (row.type) {
      types.add(row.type);
    }

    for (const tag of row.tags ?? []) {
      tags.add(tag);
    }
  }

  return {
    providers: [...providers].sort((left, right) => left.localeCompare(right)),
    tags: [...tags].sort((left, right) => left.localeCompare(right)),
    types: [...types].sort((left, right) => left.localeCompare(right)),
  };
}

const fetchModelsPage = createServerFn({ method: 'GET' })
  .validator((data: FetchModelsPageInput) => data)
  .handler(async ({ data }) =>
    listAiGatewayModelRowsPage(
      {
        limit: MODELS_PAGE_SIZE,
        page: data.page,
        provider: optionalFilter(data.provider),
        q: optionalSearch(data.search),
        tag: optionalFilter(data.tag),
        type: normalizeModelType(data.type),
      },
      await backendApiOptions()
    )
  );

const loadModelsDirectory = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ModelsDirectoryData> => {
    try {
      const options = await backendApiOptions();
      const [filterRows, initialPage] = await Promise.all([
        listAiGatewayModelRows({ type: 'all' }, options),
        listAiGatewayModelRowsPage(
          {
            limit: MODELS_PAGE_SIZE,
            page: 1,
            type: 'all',
          },
          options
        ),
      ]);

      return {
        cacheState: 'public',
        filterOptions: filterOptionsFromRows(filterRows),
        initialPage,
      };
    } catch {
      return EMPTY_MODELS_DIRECTORY;
    }
  }
);

export const Route = createFileRoute('/$locale/models')({
  component: ModelsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);
    const messages = getMessages(locale)['marketing-models'];

    return createPageHead({
      description: messages.subtitle,
      locale,
      title: messages.title,
    });
  },
  headers: ({ loaderData }) =>
    loaderData?.cacheState === 'backend-fallback'
      ? MODEL_DIRECTORY_FALLBACK_CACHE_HEADERS
      : PUBLIC_MODEL_DIRECTORY_CACHE_HEADERS,
  loader: () => loadModelsDirectory(),
});

function ModelsRoutePage() {
  const { locale } = Route.useParams();
  const data = Route.useLoaderData();
  const messages = getMessages(resolveMessagesLocale(locale))[
    'marketing-models'
  ];

  return (
    <ModelsPage
      fetchModelsPage={(input) => fetchModelsPage({ data: input })}
      filterOptions={data.filterOptions}
      initialPage={data.initialPage}
      messages={messages}
    />
  );
}
