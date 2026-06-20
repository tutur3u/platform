import {
  defaultShouldDehydrateQuery,
  dehydrate,
  QueryClient,
} from '@tanstack/react-query';

export const migrationQueryDefaults = {
  queries: {
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 30_000,
  },
};

export function createMigrationQueryClient() {
  return new QueryClient({
    defaultOptions: migrationQueryDefaults,
  });
}

export function dehydrateMigrationQueryClient(queryClient: QueryClient) {
  return dehydrate(queryClient, {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
  });
}
