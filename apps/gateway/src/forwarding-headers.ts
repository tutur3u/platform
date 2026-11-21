export const HOP_HEADER = 'x-gateway-hop';

/**
 * Client-supplied forwarding, rewrite and framework-internal request headers.
 * Neither a mounted app nor a web family Worker receives them from a client:
 * the gateway is the only party that states the public origin, and the
 * edge-set `cf-connecting-ip` is the only client address that passes through.
 */
export function isClientForwardingHeader(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.startsWith('x-forwarded-') ||
    lower.startsWith('x-original-') ||
    lower.startsWith('x-middleware-') ||
    lower.startsWith('x-nextjs-') ||
    lower.startsWith('x-next-intl-') ||
    lower.startsWith('x-tuturuuu-') ||
    (lower.startsWith('x-gateway-') && lower !== HOP_HEADER) ||
    lower.startsWith('x-vercel-') ||
    lower === 'forwarded' ||
    lower === 'x-real-ip' ||
    lower === 'x-rewrite-url'
  );
}
