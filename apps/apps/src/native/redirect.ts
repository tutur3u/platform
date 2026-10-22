import { getGatewayApp, getGatewayAppOrigin } from '../lib/apps-registry';

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
  const destination = new URL(getGatewayAppOrigin(app));
  const suffix = path.map(encodeURIComponent).join('/');
  if (suffix)
    destination.pathname = `${destination.pathname.replace(/\/+$/, '')}/${suffix}`;
  for (const [name, value] of requestUrl.searchParams) {
    destination.searchParams.append(name, value);
  }
  if (!destination.searchParams.has('source'))
    destination.searchParams.append('source', 'apps');
  return { kind: 'redirect', href: destination.toString() };
}
