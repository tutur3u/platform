/**
 * Per-app document security headers for apps that share the `tuturuuu.com`
 * origin (docs: platform/architecture/one-origin-security).
 *
 * Same-origin apps are one trust domain, so each app keeps XSS out with its
 * own CSP and limits what a successful injection can reach. This module
 * builds those headers; it does not decide enforcement. The CSP is emitted as
 * `Content-Security-Policy-Report-Only` until each app's violations are zero
 * and nonce plumbing exists.
 *
 * Portable: no framework or runtime imports.
 */

export type PermissionFeature =
  | 'autoplay'
  | 'camera'
  | 'display-capture'
  | 'fullscreen'
  | 'geolocation'
  | 'microphone'
  | 'payment'
  | 'usb';

/** `self` allows the feature for this document's origin; `none` blocks it. */
export type PermissionsProfile = Record<PermissionFeature, 'self' | 'none'>;

export interface AppSecurityProfile {
  /** Mount path on the shared origin, e.g. `/meet`. */
  basePath: string;
  /** Extra sources per directive (hosts, schemes such as `blob:`). */
  connect?: readonly string[];
  frame?: readonly string[];
  img?: readonly string[];
  media?: readonly string[];
  script?: readonly string[];
  style?: readonly string[];
  worker?: readonly string[];
  permissions: PermissionsProfile;
}

export interface DocumentSecurityContext {
  /** Origin that served this response. */
  requestOrigin: string;
  /** Shared origin, e.g. `https://tuturuuu.com`. */
  sharedOrigin: string;
  /** Optional CSP report endpoint; reports stay in the console without it. */
  reportUri?: string;
}

/** Headers safe to enforce on every document today. */
export const BASELINE_DOCUMENT_HEADERS: Readonly<Record<string, string>> = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

const PERMISSION_FEATURES: readonly PermissionFeature[] = [
  'autoplay',
  'camera',
  'display-capture',
  'fullscreen',
  'geolocation',
  'microphone',
  'payment',
  'usb',
];

/** Media, payment and device access off; fullscreen and autoplay allowed. */
export const DEFAULT_PERMISSIONS: PermissionsProfile = {
  autoplay: 'self',
  camera: 'none',
  'display-capture': 'none',
  fullscreen: 'self',
  geolocation: 'none',
  microphone: 'none',
  payment: 'none',
  usb: 'none',
};

/**
 * CSP sources for a configured URL: its origin, plus the matching `ws(s):`
 * origin when `websocket` is set. Invalid or missing values yield none.
 */
export function originSources(value: unknown, websocket = false): string[] {
  if (typeof value !== 'string') return [];
  try {
    const { origin } = new URL(value);
    return websocket ? [origin, origin.replace(/^http/u, 'ws')] : [origin];
  } catch {
    return [];
  }
}

export function buildPermissionsPolicy(profile: PermissionsProfile): string {
  return PERMISSION_FEATURES.map(
    (feature) => `${feature}=${profile[feature] === 'self' ? '(self)' : '()'}`
  ).join(', ');
}

/**
 * Sources that count as "this app" for the request. On the shared origin a
 * path-scoped source keeps one app's script from fetching another app's
 * paths; `/api/` is the central Web API every app may call. CSP ignores the
 * path after a redirect, so this is defense in depth, not a boundary.
 */
function selfSources(
  profile: AppSecurityProfile,
  context: DocumentSecurityContext
): string[] {
  const shared = new URL(context.sharedOrigin).origin;
  if (new URL(context.requestOrigin).origin !== shared) return ["'self'"];
  return [`${shared}${profile.basePath}/`, `${shared}/api/`];
}

/**
 * Report-only policy: no `'unsafe-inline'`/`'unsafe-eval'` for scripts, plus
 * Trusted Types, so inline scripts, eval and DOM-injection sinks surface as
 * violations before enforcement.
 */
export function buildReportOnlyCsp(
  profile: AppSecurityProfile,
  context: DocumentSecurityContext
): string {
  const own = selfSources(profile, context);
  const join = (...parts: readonly (readonly string[] | undefined)[]) =>
    [...new Set(parts.flatMap((part) => part ?? []))].join(' ');
  const directives = [
    `default-src ${join(own)}`,
    `script-src ${join(own, profile.script)}`,
    `style-src ${join(own, ["'unsafe-inline'"], profile.style)}`,
    `img-src ${join(own, ['data:', 'blob:'], profile.img)}`,
    `font-src ${join(own, ['data:'])}`,
    `connect-src ${join(own, profile.connect)}`,
    `media-src ${join(own, ['blob:'], profile.media)}`,
    `worker-src ${join(own, ['blob:'], profile.worker)}`,
    `frame-src ${join(own, profile.frame)}`,
    "object-src 'none'",
    "base-uri 'none'",
    `form-action ${join(own)}`,
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
  ];
  if (context.reportUri) directives.push(`report-uri ${context.reportUri}`);
  return directives.join('; ');
}

/**
 * Add the document headers to an HTML response. Existing headers set by the
 * app win, so route-specific policies are never loosened by this layer.
 */
export function applyDocumentSecurityHeaders(
  response: Response,
  profile: AppSecurityProfile,
  context: DocumentSecurityContext
): Response {
  if (response.status === 101) return response;
  const type = response.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('text/html')) return response;
  const result = new Response(response.body, response);
  const setDefault = (name: string, value: string) => {
    if (!result.headers.has(name)) result.headers.set(name, value);
  };
  for (const [name, value] of Object.entries(BASELINE_DOCUMENT_HEADERS))
    setDefault(name, value);
  setDefault('Permissions-Policy', buildPermissionsPolicy(profile.permissions));
  setDefault(
    'Content-Security-Policy-Report-Only',
    buildReportOnlyCsp(profile, context)
  );
  return result;
}
