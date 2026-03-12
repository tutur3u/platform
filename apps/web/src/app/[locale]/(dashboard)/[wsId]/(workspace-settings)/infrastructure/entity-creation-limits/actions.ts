'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

type WorkspaceProductTier = 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';

function getEntityLimitPath(wsId: string, params?: Record<string, string>) {
  const search = new URLSearchParams(params);
  const query = search.toString();

  return `/${wsId}/infrastructure/entity-creation-limits${query ? `?${query}` : ''}`;
}

function parseRequiredText(formData: FormData, fieldName: string) {
  const value = String(formData.get(fieldName) ?? '').trim();

  if (!value) {
    throw new Error(`${fieldName}_required`);
  }

  return value;
}

function parseOptionalText(formData: FormData, fieldName: string): string | undefined {
  const value = String(formData.get(fieldName) ?? '').trim();
  return value || undefined;
}

function parseBoolean(formData: FormData, fieldName: string) {
  const value = String(formData.get(fieldName) ?? '').trim().toLowerCase();

  return value === 'on' || value === 'true' || value === '1';
}

function parseNullablePositiveInteger(
  formData: FormData,
  fieldName: string
): number | undefined {
  const rawValue = String(formData.get(fieldName) ?? '').trim();

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${fieldName}_invalid`);
  }

  return parsedValue;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'unexpected_error';
}

export async function addPlatformEntityCreationLimitTable(
  wsId: string,
  formData: FormData
) {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const targetTable = parseRequiredText(formData, 'targetTable');
  const notes = parseOptionalText(formData, 'notes');

  try {
    const adminClient = await createAdminClient();
    const { error } = await adminClient.rpc(
      'add_platform_entity_creation_limit_table',
      {
        p_target_table: targetTable,
        p_notes: notes,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(getEntityLimitPath(wsId));
    redirect(getEntityLimitPath(wsId, { status: 'table-added' }));
  } catch (error) {
    redirect(
      getEntityLimitPath(wsId, {
        error: getErrorMessage(error),
      })
    );
  }
}

export async function updatePlatformEntityCreationLimitMetadata(
  wsId: string,
  targetTable: string,
  formData: FormData
) {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const notes = parseOptionalText(formData, 'notes');

  try {
    const adminClient = await createAdminClient();
    const { error } = await adminClient.rpc(
      'update_platform_entity_creation_limit_metadata',
      {
        p_target_table: targetTable,
        p_notes: notes,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(getEntityLimitPath(wsId));
    redirect(getEntityLimitPath(wsId, { status: 'metadata-saved' }));
  } catch (error) {
    redirect(
      getEntityLimitPath(wsId, {
        error: getErrorMessage(error),
      })
    );
  }
}

export async function updatePlatformEntityCreationLimitTier(
  wsId: string,
  targetTable: string,
  tier: WorkspaceProductTier,
  formData: FormData
) {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  try {
    const adminClient = await createAdminClient();
    const { error } = await adminClient.rpc(
      'update_platform_entity_creation_limit_tier',
      {
        p_target_table: targetTable,
        p_tier: tier,
        p_enabled: parseBoolean(formData, 'enabled'),
        p_per_hour: parseNullablePositiveInteger(formData, 'perHour'),
        p_per_day: parseNullablePositiveInteger(formData, 'perDay'),
        p_per_week: parseNullablePositiveInteger(formData, 'perWeek'),
        p_per_month: parseNullablePositiveInteger(formData, 'perMonth'),
        p_total_limit: parseNullablePositiveInteger(formData, 'totalLimit'),
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(getEntityLimitPath(wsId));
    redirect(getEntityLimitPath(wsId, { status: 'tier-saved' }));
  } catch (error) {
    redirect(
      getEntityLimitPath(wsId, {
        error: getErrorMessage(error),
      })
    );
  }
}

export async function reattachPlatformEntityCreationLimitTrigger(
  wsId: string,
  targetTable: string
) {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  try {
    const adminClient = await createAdminClient();
    const { error } = await adminClient.rpc(
      'reattach_platform_entity_creation_limit_trigger',
      {
        p_target_table: targetTable,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(getEntityLimitPath(wsId));
    redirect(getEntityLimitPath(wsId, { status: 'trigger-reattached' }));
  } catch (error) {
    redirect(
      getEntityLimitPath(wsId, {
        error: getErrorMessage(error),
      })
    );
  }
}
