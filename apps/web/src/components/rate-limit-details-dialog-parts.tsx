import type { RateLimitDebugDetails } from '@/lib/fetch-interceptor';

type RateLimitDetailsTranslate = (key: string) => string;

export type DetailRow = {
  label: string;
  value: boolean | number | string | null | undefined;
};

export type DetailSection = {
  rows: DetailRow[];
  title: string;
};

function formatBoolean(value: boolean) {
  return value ? 'true' : 'false';
}

function hasDisplayValue(value: DetailRow['value']) {
  return value !== null && value !== undefined && value !== '';
}

function formatDisplayValue(value: NonNullable<DetailRow['value']>) {
  return typeof value === 'boolean' ? formatBoolean(value) : String(value);
}

function readHeader(details: RateLimitDebugDetails, name: string) {
  return details.headers[name];
}

export function formatDetailsForCopy(details: RateLimitDebugDetails) {
  return JSON.stringify(
    {
      capturedAt: details.capturedAt,
      environment: {
        timezone: details.timezone,
        userAgent: details.userAgent,
      },
      headers: details.headers,
      identity: {
        clientIp: details.clientIp,
        userEmail: details.userEmail,
        userId: details.userId,
      },
      limit: {
        callerClass: readHeader(details, 'X-RateLimit-Caller-Class'),
        debugBypass: details.debugBypass,
        limit: readHeader(details, 'X-RateLimit-Limit'),
        policy: readHeader(details, 'X-RateLimit-Policy'),
        proxyBlockReason: readHeader(details, 'X-Proxy-Block-Reason'),
        remaining: readHeader(details, 'X-RateLimit-Remaining'),
        reset: readHeader(details, 'X-RateLimit-Reset'),
        retryAfterSeconds: details.retryAfterSeconds,
        retryAttempt: details.retryAttempt,
        warning: details.warning,
        willRetry: details.willRetry,
        window: readHeader(details, 'X-RateLimit-Window'),
      },
      request: {
        maxRetries: details.maxRetries,
        method: details.method,
        originalStatus: details.rateLimitStatus,
        pagePath: details.pagePath,
        requestPath: details.requestPath,
        responseStatus: details.status,
      },
    },
    null,
    2
  );
}

export function RateLimitDetailRows({ rows }: { rows: DetailRow[] }) {
  const visibleRows = rows.filter((row) => hasDisplayValue(row.value));

  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(120px,180px)_minmax(0,1fr)]">
      {visibleRows.map((row) => (
        <div className="contents" key={row.label}>
          <dt className="py-1 text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-muted/70 px-2.5 py-1.5 font-mono text-xs leading-relaxed">
            {formatDisplayValue(row.value as NonNullable<DetailRow['value']>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RateLimitDetailSection({ rows, title }: DetailSection) {
  if (!rows.some((row) => hasDisplayValue(row.value))) {
    return null;
  }

  return (
    <section
      aria-label={title}
      className="space-y-3 border-border border-t pt-5 first:border-t-0 first:pt-0"
    >
      <h3 className="font-medium text-sm">{title}</h3>
      <RateLimitDetailRows rows={rows} />
    </section>
  );
}

export function buildRateLimitDetailSections(
  details: RateLimitDebugDetails,
  t: RateLimitDetailsTranslate
): DetailSection[] {
  const header = (name: string) => readHeader(details, name);

  return [
    {
      title: t('rate_limited_details_sections.request'),
      rows: [
        {
          label: t('rate_limited_details_fields.captured_at'),
          value: details.capturedAt,
        },
        {
          label: t('rate_limited_details_fields.page'),
          value: details.pagePath,
        },
        {
          label: t('rate_limited_details_fields.request'),
          value: details.requestPath,
        },
        {
          label: t('rate_limited_details_fields.method'),
          value: details.method,
        },
        {
          label: t('rate_limited_details_fields.status'),
          value: details.status,
        },
        {
          label: t('rate_limited_details_fields.rate_limit_status'),
          value: details.rateLimitStatus,
        },
      ],
    },
    {
      title: t('rate_limited_details_sections.identity'),
      rows: [
        {
          label: t('rate_limited_details_fields.client_ip'),
          value: details.clientIp,
        },
        {
          label: t('rate_limited_details_fields.user_id'),
          value: details.userId,
        },
        {
          label: t('rate_limited_details_fields.user_email'),
          value: details.userEmail,
        },
        {
          label: t('rate_limited_details_fields.caller_class'),
          value: header('X-RateLimit-Caller-Class'),
        },
        {
          label: t('rate_limited_details_fields.debug_bypass'),
          value: details.debugBypass,
        },
      ],
    },
    {
      title: t('rate_limited_details_sections.limit'),
      rows: [
        {
          label: t('rate_limited_details_fields.retry_after'),
          value: `${details.retryAfterSeconds}s`,
        },
        {
          label: t('rate_limited_details_fields.retry_attempt'),
          value: `${details.retryAttempt}/${details.maxRetries}`,
        },
        {
          label: t('rate_limited_details_fields.will_retry'),
          value: details.willRetry,
        },
        {
          label: t('rate_limited_details_fields.policy'),
          value: header('X-RateLimit-Policy'),
        },
        {
          label: t('rate_limited_details_fields.window'),
          value: header('X-RateLimit-Window'),
        },
        {
          label: t('rate_limited_details_fields.limit'),
          value: header('X-RateLimit-Limit'),
        },
        {
          label: t('rate_limited_details_fields.remaining'),
          value: header('X-RateLimit-Remaining'),
        },
        {
          label: t('rate_limited_details_fields.reset'),
          value: header('X-RateLimit-Reset'),
        },
        {
          label: t('rate_limited_details_fields.proxy_block_reason'),
          value: header('X-Proxy-Block-Reason'),
        },
        {
          label: t('rate_limited_details_fields.warning'),
          value: details.warning,
        },
      ],
    },
    {
      title: t('rate_limited_details_sections.environment'),
      rows: [
        {
          label: t('rate_limited_details_fields.timezone'),
          value: details.timezone,
        },
        {
          label: t('rate_limited_details_fields.user_agent'),
          value: details.userAgent,
        },
      ],
    },
  ];
}

export function buildRateLimitHeaderRows(
  details: RateLimitDebugDetails
): DetailRow[] {
  return Object.entries(details.headers).map(([label, value]) => ({
    label,
    value,
  }));
}
