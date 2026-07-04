import type { APIRequestContext } from '@playwright/test';
import {
  deleteRestRows,
  expectStatus,
  postRestRow,
  SUPABASE_URL,
  serviceHeaders,
} from './supabase-rest';

export interface WorkspaceCurrencyConfig {
  existed: boolean;
  value: string | null;
}

export async function readWorkspaceDefaultCurrencyConfig(
  request: APIRequestContext,
  workspaceId: string
): Promise<WorkspaceCurrencyConfig> {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/workspace_configs?ws_id=eq.${workspaceId}&id=eq.DEFAULT_CURRENCY&select=value`,
    {
      failOnStatusCode: false,
      headers: serviceHeaders(),
    }
  );
  await expectStatus(response, 200);

  const rows = (await response.json()) as Array<{ value: string | null }>;
  return {
    existed: rows.length > 0,
    value: rows[0]?.value ?? null,
  };
}

export async function setWorkspaceDefaultCurrencyConfig(
  request: APIRequestContext,
  workspaceId: string,
  value: string
) {
  await deleteWorkspaceDefaultCurrencyConfig(request, workspaceId);
  await postRestRow({
    request,
    table: 'workspace_configs',
    data: {
      id: 'DEFAULT_CURRENCY',
      value,
      ws_id: workspaceId,
    },
  });
}

export async function restoreWorkspaceDefaultCurrencyConfig(
  request: APIRequestContext,
  workspaceId: string,
  previousConfig: WorkspaceCurrencyConfig
) {
  await deleteWorkspaceDefaultCurrencyConfig(request, workspaceId);

  if (previousConfig.existed) {
    await postRestRow({
      request,
      table: 'workspace_configs',
      data: {
        id: 'DEFAULT_CURRENCY',
        value: previousConfig.value,
        ws_id: workspaceId,
      },
    });
  }
}

async function deleteWorkspaceDefaultCurrencyConfig(
  request: APIRequestContext,
  workspaceId: string
) {
  await deleteRestRows({
    request,
    table: 'workspace_configs',
    filter: `ws_id=eq.${workspaceId}&id=eq.DEFAULT_CURRENCY`,
  });
}
