'use server';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceProductTier } from '@tuturuuu/types/db';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { authorizeInfrastructureRootMemberRequest } from '@/lib/infrastructure-admin-access';

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
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID)
    throw new Error('Forbidden');
  const authorization = await authorizeInfrastructureRootMemberRequest(
    'manage_workspace_roles'
  );
  if (!authorization.ok) throw new Error('Forbidden');

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
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID)
    throw new Error('Forbidden');
  const authorization = await authorizeInfrastructureRootMemberRequest(
    'manage_workspace_roles'
  );
  if (!authorization.ok) throw new Error('Forbidden');

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
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID)
    throw new Error('Forbidden');
  const authorization = await authorizeInfrastructureRootMemberRequest(
    'manage_workspace_roles'
  );
  if (!authorization.ok) throw new Error('Forbidden');

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
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID)
    throw new Error('Forbidden');
  const authorization = await authorizeInfrastructureRootMemberRequest(
    'manage_workspace_roles'
  );
  if (!authorization.ok) throw new Error('Forbidden');

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
