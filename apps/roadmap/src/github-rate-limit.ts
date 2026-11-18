type Resource = 'core' | 'search';

function numberHeader(headers: Headers | undefined, name: string) {
  const value = headers?.get(`x-ratelimit-${name}`);
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function githubRateLimit(
  expectedResource: Resource,
  response: Response | undefined,
  observedAt: string
) {
  const headers = response?.headers;
  const resource = headers?.get('x-ratelimit-resource');
  return {
    event: 'roadmap.github.rate_limit',
    expectedResource,
    resource: resource === 'core' || resource === 'search' ? resource : null,
    status: response?.status ?? null,
    limit: numberHeader(headers, 'limit'),
    remaining: numberHeader(headers, 'remaining'),
    reset: numberHeader(headers, 'reset'),
    observedAt,
  };
}
