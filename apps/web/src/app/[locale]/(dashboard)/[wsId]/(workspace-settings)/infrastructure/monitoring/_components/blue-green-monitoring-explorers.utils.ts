import type { BlueGreenMonitoringRequestLog } from '@tuturuuu/internal-api/infrastructure';

export interface ParsedMonitoringRequestPath {
  isServerComponentRequest: boolean;
  pathname: string;
  querySignature: string;
  search: string;
  searchParamKeys: string[];
}

export interface MonitoringRouteSummary {
  averageLatencyMs: number | null;
  errorCount: number;
  internalCount: number;
  isServerComponentRoute: boolean;
  pathname: string;
  querySignatures: string[];
  requestCount: number;
  rscCount: number;
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

export function getMonitoringStatusFamily(status: number | null | undefined) {
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

export function buildMonitoringRouteSummaries(
  requests: BlueGreenMonitoringRequestLog[]
): MonitoringRouteSummary[] {
  const summaryMap = new Map<
    string,
    MonitoringRouteSummary & {
      latencySamples: number[];
      querySignatureSet: Set<string>;
    }
  >();

  for (const request of requests) {
    const parsedPath = parseMonitoringRequestPath(request.path);
    const existing = summaryMap.get(parsedPath.pathname) ?? {
      averageLatencyMs: null,
      errorCount: 0,
      internalCount: 0,
      isServerComponentRoute: false,
      latencySamples: [],
      pathname: parsedPath.pathname,
      querySignatureSet: new Set<string>(),
      querySignatures: [],
      requestCount: 0,
      rscCount: 0,
    };

    existing.requestCount += 1;
    existing.isServerComponentRoute =
      existing.isServerComponentRoute || parsedPath.isServerComponentRequest;

    if (request.isInternal) {
      existing.internalCount += 1;
    }

    if (parsedPath.isServerComponentRequest) {
      existing.rscCount += 1;
    }

    if ((request.status ?? 0) >= 400) {
      existing.errorCount += 1;
    }

    if (
      request.requestTimeMs != null &&
      Number.isFinite(request.requestTimeMs)
    ) {
      existing.latencySamples.push(request.requestTimeMs);
    }

    if (parsedPath.querySignature) {
      existing.querySignatureSet.add(parsedPath.querySignature);
    }

    summaryMap.set(parsedPath.pathname, existing);
  }

  return [...summaryMap.values()]
    .map(({ latencySamples, querySignatureSet, ...summary }) => ({
      ...summary,
      averageLatencyMs:
        latencySamples.length > 0
          ? latencySamples.reduce((sum, latency) => sum + latency, 0) /
            latencySamples.length
          : null,
      querySignatures: [...querySignatureSet].sort(),
    }))
    .sort((left, right) => {
      if (right.requestCount !== left.requestCount) {
        return right.requestCount - left.requestCount;
      }

      return left.pathname.localeCompare(right.pathname);
    });
}
