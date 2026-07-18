import type { QueryClient } from '@tanstack/react-query';
import type { ComponentType } from 'react';

export type NamedResource = { id: string; name?: string | null };

export type ResourceConfig = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  rows: NamedResource[];
  create: (name: string) => Promise<unknown>;
  update: (id: string, name: string) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};

export function invalidateSetup(queryClient: QueryClient, wsId: string) {
  queryClient.invalidateQueries({
    queryKey: ['inventory', wsId, 'form-options'],
  });
  queryClient.invalidateQueries({
    queryKey: ['inventory', wsId, 'categories'],
  });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'suppliers'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'batches'] });
}

export function namedRows(rows: Array<{ id?: string; name?: string | null }>) {
  return rows.filter((row): row is NamedResource => Boolean(row.id));
}
