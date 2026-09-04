import type { AIModelUI } from '@tuturuuu/types';

export const DEFAULT_CHAT_MODEL: AIModelUI = {
  value: 'google/gemini-3-flash',
  label: 'gemini-3-flash',
  provider: 'google',
};

export function getChatRouteProvider() {
  return 'google';
}

export function toChatModel(modelId: string | null | undefined) {
  if (!modelId) return undefined;

  const qualified = modelId.includes('/');
  return {
    value: qualified ? modelId : `google/${modelId}`,
    label: qualified ? modelId.split('/').slice(1).join('/') : modelId,
    provider: qualified ? modelId.split('/')[0]! : 'google',
  } satisfies AIModelUI;
}
