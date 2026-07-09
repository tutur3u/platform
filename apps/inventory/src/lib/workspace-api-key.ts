import { validateApiKey } from '@tuturuuu/auth/api-keys';

export async function validateWorkspaceApiKey(
  wsId: string,
  apiKey: string
): Promise<boolean> {
  const context = await validateApiKey(apiKey);
  return context?.wsId === wsId;
}
