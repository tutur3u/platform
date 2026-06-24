import type { BlueGreenMonitoringRequestLog } from '@tuturuuu/internal-api/infrastructure/monitoring';

export interface ParsedMonitoringRequestPath {
  isServerComponentRequest: boolean;
  pathname: string;
  querySignature: string;
  search: string;
  searchParamKeys: string[];
}

export type MonitoringStatusFamily =
  | '1xx'
  | '2xx'
  | '3xx'
  | '4xx'
  | '5xx'
  | 'unknown';

export type MonitoringRenderFilter = 'all' | 'document' | 'rsc';
export type MonitoringTrafficFilter = 'all' | 'external' | 'internal';

export interface EnrichedMonitoringRequest
  extends BlueGreenMonitoringRequestLog {
  parsedPath: ParsedMonitoringRequestPath;
  statusFamily: MonitoringStatusFamily;
  statusValue: string;
}

export function parseMonitoringRequestPath(
  rawPath: string
): ParsedMonitoringRequestPath {
  try {
    const url = new URL(rawPath, 'http://127.0.0.1');
    const pathname = url.pathname || '/';
    const searchParamKeys = [...new Set(url.searchParams.keys())].sort();

    return {
      isServerComponentRequest: url.searchParams.has('_rsc'),
      pathname,
      querySignature:
        searchParamKeys.length > 0 ? `?${searchParamKeys.join('&')}` : '',
      search: url.search,
      searchParamKeys,
    };
  } catch {
    return {
      isServerComponentRequest: rawPath.includes('_rsc='),
      pathname: rawPath || '/',
      querySignature: '',
      search: '',
      searchParamKeys: [],
    };
  }
}

export function getMonitoringStatusFamily(
  status: number | null | undefined
): MonitoringStatusFamily {
  if (status == null || !Number.isFinite(status)) {
    return 'unknown';
  }

  if (status >= 500) {
    return '5xx';
  }

  if (status >= 400) {
    return '4xx';
  }

  if (status >= 300) {
    return '3xx';
  }

  if (status >= 200) {
    return '2xx';
  }

  if (status >= 100) {
    return '1xx';
  }

  return 'unknown';
}

export function enrichMonitoringRequests(
  requests: BlueGreenMonitoringRequestLog[]
): EnrichedMonitoringRequest[] {
  return requests.map((request) => ({
    ...request,
    parsedPath: parseMonitoringRequestPath(request.path),
    statusFamily: getMonitoringStatusFamily(request.status),
    statusValue: request.status != null ? String(request.status) : 'unknown',
  }));
}

export function getRequestKey(request: BlueGreenMonitoringRequestLog) {
  return [
    request.time,
    request.method ?? 'REQ',
    request.status ?? 'unknown',
    request.host ?? 'host',
    request.path,
  ].join(':');
}
