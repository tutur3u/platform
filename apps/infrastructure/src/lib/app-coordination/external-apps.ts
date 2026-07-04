import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  appFieldKey,
  assertAppId,
  EXTERNAL_APP_SECRET_PREFIX,
  type ExternalAppSecretField,
  generateAppSecret,
  hashAppSecret,
  normalizeOrigin,
  normalizeOrigins,
  normalizeScopes,
  normalizeWorkspaceIds,
  parseAppFieldKey,
  parseJsonStringArray,
  type SecretRow,
  safeEqual,
} from './external-apps-utils';

export type ExternalAppRegistration = {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
  createdAt: string | null;
  createdBy: string | null;
  displayName: string;
  enabled: boolean;
  id: string;
  origins: string[];
  secretIssuedAt: string | null;
  secretLastFour: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type UpsertExternalAppPayload = {
  allowedScopes?: string[];
  allowedWorkspaceIds?: string[];
  displayName: string;
  enabled: boolean;
  id: string;
  issueSecret?: boolean;
  origins: string[];
};

export type UpsertExternalAppResult = {
  app: ExternalAppRegistration;
  secret: string | null;
};

export type VerifyExternalAppSecretResult =
  | {
      app: ExternalAppRegistration;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

function buildExternalAppRegistrations(rows: SecretRow[]) {
  const grouped = new Map<
    string,
    Partial<Record<ExternalAppSecretField, string>>
  >();

  for (const row of rows) {
    const parsed = parseAppFieldKey(row.name);

    if (!parsed) {
      continue;
    }

    const entry = grouped.get(parsed.appId) ?? {};
    entry[parsed.field] = row.value ?? '';
    grouped.set(parsed.appId, entry);
  }

  return [...grouped.entries()]
    .map(([id, values]): ExternalAppRegistration => {
      const displayName = values.displayName?.trim() || id;
      const origins = normalizeOrigins(parseJsonStringArray(values.origins));
      const allowedScopes = normalizeScopes(
        parseJsonStringArray(values.allowedScopes),
        values.allowedScopes === undefined ? undefined : []
      );
      const allowedWorkspaceIds = normalizeWorkspaceIds(
        parseJsonStringArray(values.allowedWorkspaceIds)
      );

      return {
        allowedScopes,
        allowedWorkspaceIds,
        createdAt: values.createdAt || null,
        createdBy: values.createdBy || null,
        displayName,
        enabled: values.enabled !== 'false',
        id,
        origins,
        secretIssuedAt: values.secretIssuedAt || null,
        secretLastFour: values.secretLastFour || null,
        updatedAt: values.updatedAt || null,
        updatedBy: values.updatedBy || null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function readExternalAppSecretRows(db?: TypedSupabaseClient) {
  const sbAdmin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await sbAdmin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .like('name', `${EXTERNAL_APP_SECRET_PREFIX}:%`);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function readExternalAppFieldRows(
  appId: string,
  db?: TypedSupabaseClient
) {
  const sbAdmin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await sbAdmin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .like('name', `${EXTERNAL_APP_SECRET_PREFIX}:${appId}:%`);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function replaceExternalAppFields({
  appId,
  fields,
  sbAdmin,
}: {
  appId: string;
  fields: Partial<Record<ExternalAppSecretField, string>>;
  sbAdmin: TypedSupabaseClient;
}) {
  const names = Object.keys(fields).map((field) =>
    appFieldKey(appId, field as ExternalAppSecretField)
  );

  if (names.length === 0) {
    return;
  }

  const { error: deleteError } = await sbAdmin
    .from('workspace_secrets')
    .delete()
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .in('name', names);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await sbAdmin.from('workspace_secrets').insert(
    Object.entries(fields).map(([field, value]) => ({
      name: appFieldKey(appId, field as ExternalAppSecretField),
      value,
      ws_id: ROOT_WORKSPACE_ID,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function listExternalApps(db?: TypedSupabaseClient) {
  return buildExternalAppRegistrations(await readExternalAppSecretRows(db));
}

export async function getExternalAppById(
  appId: string,
  db?: TypedSupabaseClient
) {
  const id = assertAppId(appId);
  const [app] = buildExternalAppRegistrations(
    await readExternalAppFieldRows(id, db)
  );

  return app ?? null;
}

export async function getExternalAppByReturnUrl(
  returnUrl: string,
  db?: TypedSupabaseClient
) {
  const origin = normalizeOrigin(returnUrl);

  if (!origin) {
    return null;
  }

  const apps = await listExternalApps(db);
  return (
    apps.find((app) => app.enabled && app.origins.includes(origin)) ?? null
  );
}

export function getAllowedAppTokenScopes({
  allowedScopes,
  requestedScopes,
}: {
  allowedScopes: string[];
  requestedScopes: string[];
}) {
  const allowed = normalizeScopes(allowedScopes, []);
  const requested = normalizeScopes(requestedScopes, []);

  if (requested.length === 0) {
    return allowed;
  }

  const invalidScope = requested.find((scope) => {
    if (allowed.includes(scope) || allowed.includes('*')) {
      return false;
    }

    return !allowed.some((allowedScope) => {
      if (!allowedScope.endsWith(':*')) {
        return false;
      }

      return scope.startsWith(allowedScope.slice(0, -1));
    });
  });

  if (invalidScope) {
    throw new Error('app_scope_not_allowed');
  }

  return requested;
}

export async function upsertExternalApp({
  actorUserId,
  payload,
}: {
  actorUserId: string;
  payload: UpsertExternalAppPayload;
}): Promise<UpsertExternalAppResult> {
  const appId = assertAppId(payload.id);
  const origins = normalizeOrigins(payload.origins);

  if (origins.length === 0) {
    throw new Error('origins_required');
  }

  const displayName = payload.displayName.trim() || appId;
  const allowedScopes = normalizeScopes(payload.allowedScopes, []);
  const allowedWorkspaceIds = normalizeWorkspaceIds(
    payload.allowedWorkspaceIds
  );
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const existingApp = await getExternalAppById(appId, sbAdmin);
  const now = new Date().toISOString();
  const nextSecret = payload.issueSecret ? generateAppSecret() : null;
  const fields: Partial<Record<ExternalAppSecretField, string>> = {
    allowedScopes: JSON.stringify(allowedScopes),
    allowedWorkspaceIds: JSON.stringify(allowedWorkspaceIds),
    createdAt: existingApp?.createdAt ?? now,
    createdBy: existingApp?.createdBy ?? actorUserId,
    displayName,
    enabled: payload.enabled ? 'true' : 'false',
    origins: JSON.stringify(origins),
    updatedAt: now,
    updatedBy: actorUserId,
  };

  if (nextSecret) {
    fields.secretHash = hashAppSecret(nextSecret);
    fields.secretIssuedAt = now;
    fields.secretLastFour = nextSecret.slice(-4);
  }

  await replaceExternalAppFields({
    appId,
    fields,
    sbAdmin,
  });

  const app = await getExternalAppById(appId, sbAdmin);

  if (!app) {
    throw new Error('external_app_save_failed');
  }

  return {
    app,
    secret: nextSecret,
  };
}

export async function rotateExternalAppSecret({
  actorUserId,
  appId,
}: {
  actorUserId: string;
  appId: string;
}): Promise<UpsertExternalAppResult> {
  const id = assertAppId(appId);
  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const app = await getExternalAppById(id, sbAdmin);

  if (!app) {
    throw new Error('external_app_not_found');
  }

  const nextSecret = generateAppSecret();
  const now = new Date().toISOString();

  await replaceExternalAppFields({
    appId: id,
    fields: {
      secretHash: hashAppSecret(nextSecret),
      secretIssuedAt: now,
      secretLastFour: nextSecret.slice(-4),
      updatedAt: now,
      updatedBy: actorUserId,
    },
    sbAdmin,
  });

  const updatedApp = await getExternalAppById(id, sbAdmin);

  if (!updatedApp) {
    throw new Error('external_app_save_failed');
  }

  return {
    app: updatedApp,
    secret: nextSecret,
  };
}

export async function verifyExternalAppSecret({
  appId,
  appSecret,
}: {
  appId: string;
  appSecret: string;
}): Promise<VerifyExternalAppSecretResult> {
  let id: string;

  try {
    id = assertAppId(appId);
  } catch {
    return { error: 'Invalid app id', ok: false };
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const rows = await readExternalAppFieldRows(id, sbAdmin);
  const [app] = buildExternalAppRegistrations(rows);
  const secretHash =
    rows.find((row) => row.name === appFieldKey(id, 'secretHash'))?.value ?? '';

  if (!app?.enabled || !secretHash) {
    return { error: 'Invalid app credentials', ok: false };
  }

  const providedHash = hashAppSecret(appSecret);

  if (!safeEqual(providedHash, secretHash)) {
    return { error: 'Invalid app credentials', ok: false };
  }

  return {
    app,
    ok: true,
  };
}
