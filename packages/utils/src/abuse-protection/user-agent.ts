export type UserAgentRiskLevel = 'allow' | 'block';

export interface UserAgentClassification {
  matchedPattern: string | null;
  normalizedUserAgent: string | null;
  reason: string | null;
  riskLevel: UserAgentRiskLevel;
}

const NATIVE_APP_SIGNATURE_REGEX =
  /\b(?:cfnetwork|dart(?:\/|\s)|dart:io|dalvik|flutter|okhttp)\b/i;
const KNOWN_AUTOMATION_REGEX =
  /\b(?:headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver)\b/i;
const KNOWN_SCRIPT_CLIENT_REGEX =
  /\b(?:axios\/|curl\/|go-http-client|java\/|node-fetch|python-requests|wget\/)\b/i;
const KNOWN_CRAWLER_REGEX = /\b(?:bot|crawler|scrapy|spider)\b/i;
const BROWSER_SIGNATURE_REGEX =
  /\b(?:applewebkit|chrome\/|edg\/|firefox\/|gecko\/|mozilla\/5\.0|opr\/|safari\/|version\/)\b/i;

function normalizeUserAgent(value?: string | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function extractUserAgentFromHeaders(
  headers: Headers | Map<string, string> | Record<string, string | null>
) {
  if (headers instanceof Headers) {
    return normalizeUserAgent(headers.get('user-agent'));
  }

  if (headers instanceof Map) {
    return normalizeUserAgent(headers.get('user-agent') || null);
  }

  return normalizeUserAgent(headers['user-agent']);
}

export function classifyPotentialSpamUserAgent(
  userAgent?: string | null,
  options: { allowNativeAppUserAgents?: boolean } = {}
): UserAgentClassification {
  const normalizedUserAgent = normalizeUserAgent(userAgent);

  if (!normalizedUserAgent) {
    return {
      matchedPattern: null,
      normalizedUserAgent,
      reason: 'missing_user_agent',
      riskLevel: 'block',
    };
  }

  if (
    options.allowNativeAppUserAgents &&
    NATIVE_APP_SIGNATURE_REGEX.test(normalizedUserAgent)
  ) {
    return {
      matchedPattern: null,
      normalizedUserAgent,
      reason: null,
      riskLevel: 'allow',
    };
  }

  const blockedMatchers = [
    {
      reason: 'known_automation_framework',
      regex: KNOWN_AUTOMATION_REGEX,
    },
    {
      reason: 'scripted_http_client',
      regex: KNOWN_SCRIPT_CLIENT_REGEX,
    },
    {
      reason: 'known_crawler_agent',
      regex: KNOWN_CRAWLER_REGEX,
    },
  ] as const;

  for (const matcher of blockedMatchers) {
    const match = normalizedUserAgent.match(matcher.regex);
    if (match) {
      return {
        matchedPattern: match[0] || null,
        normalizedUserAgent,
        reason: matcher.reason,
        riskLevel: 'block',
      };
    }
  }

  if (normalizedUserAgent.length < 20) {
    return {
      matchedPattern: null,
      normalizedUserAgent,
      reason: 'short_user_agent',
      riskLevel: 'block',
    };
  }

  if (
    normalizedUserAgent.startsWith('Mozilla/5.0') &&
    !BROWSER_SIGNATURE_REGEX.test(normalizedUserAgent)
  ) {
    return {
      matchedPattern: 'Mozilla/5.0',
      normalizedUserAgent,
      reason: 'malformed_browser_claim',
      riskLevel: 'block',
    };
  }

  return {
    matchedPattern: null,
    normalizedUserAgent,
    reason: null,
    riskLevel: 'allow',
  };
}
