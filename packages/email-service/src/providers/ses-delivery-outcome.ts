import type { ProviderSendResult } from '../types';
export const UNKNOWN_DELIVERY_ERROR =
  'Email delivery outcome is unknown. Check provider logs before retrying.';
function httpStatus(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = Reflect.get(value, '$metadata');
  if (!metadata || typeof metadata !== 'object') return undefined;
  const status = Reflect.get(metadata, 'httpStatusCode');
  return typeof status === 'number' && Number.isInteger(status)
    ? status
    : undefined;
}
function rejected(status?: number): ProviderSendResult {
  return {
    success: false,
    deliveryOutcome: 'rejected',
    error: 'Email provider rejected the delivery.',
    httpStatus: status,
  };
}
function unknown(status?: number): ProviderSendResult {
  return {
    success: false,
    deliveryOutcome: 'unknown',
    error: UNKNOWN_DELIVERY_ERROR,
    httpStatus: status,
  };
}
export function sesResponseOutcome(response: unknown): ProviderSendResult {
  const status = httpStatus(response);
  const id =
    response && typeof response === 'object'
      ? Reflect.get(response, 'MessageId')
      : undefined;
  if (status === 200 && typeof id === 'string' && /^[!-~]{1,256}$/.test(id))
    return {
      success: true,
      deliveryOutcome: 'accepted',
      messageId: id,
      httpStatus: status,
    };
  // A timeout response does not establish whether dispatch was accepted.
  if (status && status >= 400 && status < 500 && status !== 408)
    return rejected(status);
  return unknown(status);
}
export function sesFailureOutcome(
  error: unknown,
  dispatched: boolean
): ProviderSendResult {
  if (!dispatched)
    return {
      success: false,
      deliveryOutcome: 'rejected',
      error: 'Email validation failed before provider dispatch.',
    };
  const status = httpStatus(error);
  // Names alone are not proof of a service response. Require a definitive 4xx.
  if (status && status >= 400 && status < 500 && status !== 408)
    return rejected(status);
  return unknown(status);
}
