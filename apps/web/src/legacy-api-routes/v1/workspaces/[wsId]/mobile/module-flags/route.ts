import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

const HIDE_EXPERIMENTAL_MODULES_SECRET = 'MOBILE_HIDE_EXPERIMENTAL_MODULES';
const HIDDEN_MODULES_SECRET = 'MOBILE_HIDDEN_MODULES';
const MODULE_FLAG_SECRET_NAMES = [
  HIDE_EXPERIMENTAL_MODULES_SECRET,
  HIDDEN_MODULES_SECRET,
];
const EXPERIMENTAL_MODULE_IDS = [
  'cms',
  'crm',
  'documents',
  'drive',
  'education',
  'inventory',
  'meet',
];

interface Params {
  wsId: string;
}

function isTruthyFlag(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function parseModuleIds(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Fall back to comma-separated values.
  }

  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const GET = withSessionAuth<Params>(
  async (_req: NextRequest, { user, supabase }, { wsId }) => {
    const resolvedWsId = resolveWorkspaceId(wsId);

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', resolvedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const admin = await createAdminClient();
    const { data: secrets, error } = await admin
      .from('workspace_secrets')
      .select('name, value')
      .eq('ws_id', resolvedWsId)
      .in('name', MODULE_FLAG_SECRET_NAMES);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load mobile module flags' },
        { status: 500 }
      );
    }

    const values = new Map(
      (secrets ?? []).map((secret) => [secret.name, secret.value])
    );
    const hiddenModuleIds = new Set<string>(
      parseModuleIds(values.get(HIDDEN_MODULES_SECRET) ?? null)
    );

    if (isTruthyFlag(values.get(HIDE_EXPERIMENTAL_MODULES_SECRET) ?? null)) {
      for (const moduleId of EXPERIMENTAL_MODULE_IDS) {
        hiddenModuleIds.add(moduleId);
      }
    }

    return NextResponse.json({
      hiddenModuleIds: Array.from(hiddenModuleIds).sort(),
    });
  },
  { cache: { maxAge: 60, swr: 60 } }
);
