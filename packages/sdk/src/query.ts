import type { EpmClient } from './epm';
import type {
  ExternalProjectDeliveryOptions,
  ExternalProjectLoadingData,
  YoolaExternalProjectLoadingData,
} from './types';

type EpmDeliveryClient = Pick<
  EpmClient,
  'getDelivery' | 'getLoadingData' | 'getYoolaLoadingData'
>;

type QueryScope = {
  scope?: string;
};

function getScope(scope: string | undefined) {
  return scope?.trim() || 'default';
}

export function getEpmDeliveryQueryKey(
  workspaceId: string,
  options: ExternalProjectDeliveryOptions = {},
  { scope }: QueryScope = {}
) {
  return [
    'tuturuuu',
    'epm',
    getScope(scope),
    'delivery',
    workspaceId,
    options.preview === true,
  ] as const;
}

export function getEpmLoadingDataQueryKey(
  workspaceId: string,
  options: ExternalProjectDeliveryOptions = {},
  { scope }: QueryScope = {}
) {
  return [
    'tuturuuu',
    'epm',
    getScope(scope),
    'loading-data',
    workspaceId,
    options.preview === true,
  ] as const;
}

export function getYoolaLoadingDataQueryKey(
  workspaceId: string,
  options: ExternalProjectDeliveryOptions = {},
  { scope }: QueryScope = {}
) {
  return [
    'tuturuuu',
    'epm',
    getScope(scope),
    'yoola-loading-data',
    workspaceId,
    options.preview === true,
  ] as const;
}

export function getEpmDeliveryQueryOptions(
  client: Pick<EpmDeliveryClient, 'getDelivery'>,
  workspaceId: string,
  options: ExternalProjectDeliveryOptions = {},
  queryScope?: QueryScope
) {
  return {
    queryFn: () => client.getDelivery(workspaceId, options),
    queryKey: getEpmDeliveryQueryKey(workspaceId, options, queryScope),
  };
}

export function getEpmLoadingDataQueryOptions(
  client: Pick<EpmDeliveryClient, 'getLoadingData'>,
  workspaceId: string,
  options: ExternalProjectDeliveryOptions = {},
  queryScope?: QueryScope
) {
  return {
    queryFn: () =>
      client.getLoadingData(
        workspaceId,
        options
      ) as Promise<ExternalProjectLoadingData | null>,
    queryKey: getEpmLoadingDataQueryKey(workspaceId, options, queryScope),
  };
}

export function getYoolaLoadingDataQueryOptions(
  client: Pick<EpmDeliveryClient, 'getYoolaLoadingData'>,
  workspaceId: string,
  options: ExternalProjectDeliveryOptions = {},
  queryScope?: QueryScope
) {
  return {
    queryFn: () =>
      client.getYoolaLoadingData(
        workspaceId,
        options
      ) as Promise<YoolaExternalProjectLoadingData>,
    queryKey: getYoolaLoadingDataQueryKey(workspaceId, options, queryScope),
  };
}
