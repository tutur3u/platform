export const FEEDBACK_REQUEST_BYTES = 2850000;

export function feedbackProxyPayloadLimit(method: string, pathname: string) {
  return method === 'POST' && pathname === '/api/v1/product-feedback'
    ? FEEDBACK_REQUEST_BYTES
    : undefined;
}
