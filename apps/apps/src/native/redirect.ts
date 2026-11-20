import { buildGatewayRedirectUrl, getGatewayApp } from '../lib/apps-registry';

type GatewayDestination =
  | { kind: 'invalid' | 'catalogue' | 'missing' }
  | { kind: 'redirect'; href: string };

export function gatewayDestination(requestUrl: URL): GatewayDestination {
  let segments: string[];
  try {
    segments = requestUrl.pathname
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    return { kind: 'invalid' };
  }
  const [slug, ...path] = segments;
  if (!slug) return { kind: 'catalogue' };
  const app = getGatewayApp(slug);
  if (!app) return { kind: 'missing' };
  return {
    kind: 'redirect',
    href: buildGatewayRedirectUrl({ app, path, search: requestUrl.search }),
  };
}
