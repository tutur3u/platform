'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceProductTier } from '@tuturuuu/types/db';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';

function parseRequiredText(formData: FormData, fieldName: string) {
  const value = String(formData.get(fieldName) ?? '').trim();

  if (!value) {
    throw new Error(`${fieldName}_required`);
  }

  return value;
}

function parseOptionalText(
  formData: FormData,
  fieldName: string
): string | undefined {
  const value = String(formData.get(fieldName) ?? '').trim();
  return value || undefined;
}

function parseBoolean(formData: FormData, fieldName: string) {
  const value = String(formData.get(fieldName) ?? '')
    .trim()
    .toLowerCase();

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
  console.error('Entity creation limit action failed', error);

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'unexpected_error';
}

export async function addPlatformEntityCreationLimitTable(
  wsId: string,
  formData: FormData
): Promise<{ status: 'table-added' }> {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const targetTable = parseRequiredText(formData, 'targetTable');
  const notes = parseOptionalText(formData, 'notes');

  try {
    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin.rpc(
      'add_platform_entity_creation_limit_table',
      {
        p_target_table: targetTable,
        p_notes: notes,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return { status: 'table-added' };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updatePlatformEntityCreationLimitMetadata(
  wsId: string,
  targetTable: string,
  formData: FormData
): Promise<{ status: 'metadata-saved' }> {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const notes = parseOptionalText(formData, 'notes');

  try {
    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin.rpc(
      'update_platform_entity_creation_limit_metadata',
      {
        p_target_table: targetTable,
        p_notes: notes,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return { status: 'metadata-saved' };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updatePlatformEntityCreationLimitTier(
  wsId: string,
  targetTable: string,
  tier: WorkspaceProductTier,
  formData: FormData
): Promise<{ status: 'tier-saved' }> {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  try {
    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin.rpc(
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

    return { status: 'tier-saved' };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function reattachPlatformEntityCreationLimitTrigger(
  wsId: string,
  targetTable: string
): Promise<{ status: 'trigger-reattached' }> {
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  try {
    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin.rpc(
      'reattach_platform_entity_creation_limit_trigger',
      {
        p_target_table: targetTable,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return { status: 'trigger-reattached' };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
