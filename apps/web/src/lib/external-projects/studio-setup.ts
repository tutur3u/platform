import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  ExternalProjectAdapterKind,
  ExternalProjectSyncManifest,
  ExternalProjectSyncSchema,
  Json,
} from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { setWorkspaceCmsSiteTemplate } from './binding-settings';
import {
  getDefaultCanonicalExternalProjectId,
  resolveWorkspaceExternalProjectBinding,
} from './binding-state';
import {
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_DISPLAY_NAMES,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from './constants';

type AdminDb = TypedSupabaseClient;

/**
 * Who is running studio setup.
 *
 * Enabling External Project Studio for a workspace and creating or changing a
 * shared `canonical_external_projects` row are root platform-admin actions, so
 * only the `root` scope may do either (and it records the same binding audit
 * row as the root linking console). A `workspace` caller, such as a linked app
 * provisioning its own content model, may only refresh the workspace field
 * definitions and template of a studio already enabled for the same adapter.
 */
export type ExternalProjectSetupScope = 'root' | 'workspace';

export class ExternalProjectSetupForbiddenError extends Error {
  constructor() {
    super(
      'External Project Studio must be enabled by a platform administrator'
    );
    this.name = 'ExternalProjectSetupForbiddenError';
  }
}

function getExternalProjectSchemaCollectionSlugs(
  schema?: ExternalProjectSyncSchema
) {
  return schema?.collections.map((collection) => collection.slug) ?? [];
}

function buildExternalProjectDeliveryProfile(
  schema?: ExternalProjectSyncSchema,
  template?: ExternalProjectSyncManifest['template']
) {
  return {
    schema: schema ?? { collections: [] },
    ...(template ? { template } : {}),
  } as NonNullable<Json>;
}

async function ensureCanonicalExternalProject({
  adapter,
  admin,
  actorId,
  canonicalProjectId = getDefaultCanonicalExternalProjectId(adapter),
  schema,
  template,
}: {
  adapter: ExternalProjectAdapterKind;
  admin: AdminDb;
  actorId: string | null;
  canonicalProjectId?: string;
  schema?: ExternalProjectSyncSchema;
  template?: ExternalProjectSyncManifest['template'];
}) {
  const { data: existingProject, error: existingProjectError } = await admin
    .from('canonical_external_projects')
    .select('*')
    .eq('id', canonicalProjectId)
    .maybeSingle();

  if (existingProjectError) {
    throw new Error(existingProjectError.message);
  }

  if (existingProject) {
    if (existingProject.adapter !== adapter) {
      throw new Error(
        `Canonical external project ${canonicalProjectId} already uses the ${existingProject.adapter} adapter`
      );
    }

    if (!existingProject.is_active) {
      throw new Error(
        `Canonical external project ${canonicalProjectId} is inactive`
      );
    }

    if (
      adapter === 'custom' &&
      !existingProject.allowed_features.includes('chat')
    ) {
      const { data: upgradedProject, error: upgradeError } = await admin
        .from('canonical_external_projects')
        .update({
          allowed_features: [...existingProject.allowed_features, 'chat'],
          updated_by: actorId,
        })
        .eq('id', canonicalProjectId)
        .select('*')
        .single();
      if (upgradeError) throw new Error(upgradeError.message);
      return {
        canonicalProject: upgradedProject,
        created: false,
        id: canonicalProjectId,
      };
    }

    return {
      canonicalProject: existingProject,
      created: false,
      id: canonicalProjectId,
    };
  }

  const schemaCollectionSlugs = getExternalProjectSchemaCollectionSlugs(schema);
  const allowedCollections =
    schemaCollectionSlugs.length > 0
      ? schemaCollectionSlugs
      : DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[adapter];

  const { data: canonicalProject, error: insertError } = await admin
    .from('canonical_external_projects')
    .insert({
      adapter,
      allowed_collections: allowedCollections,
      allowed_features:
        adapter === 'custom'
          ? ['sync', 'assets', 'delivery', 'chat']
          : ['sync', 'assets', 'delivery'],
      created_by: actorId,
      delivery_profile: buildExternalProjectDeliveryProfile(schema, template),
      display_name: EXTERNAL_PROJECT_DISPLAY_NAMES[adapter],
      id: canonicalProjectId,
      is_active: true,
      metadata: {
        autoSetup: true,
        adapter,
        ...(template ? { template } : {}),
      },
      updated_by: actorId,
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    canonicalProject,
    created: true,
    id: canonicalProjectId,
  };
}

async function bindWorkspaceExternalProject({
  actorId,
  admin,
  canonicalProjectId,
  previousCanonicalId,
  workspaceId,
}: {
  actorId: string | null;
  admin: AdminDb;
  canonicalProjectId: string;
  previousCanonicalId: string | null;
  workspaceId: string;
}) {
  if (workspaceId === ROOT_WORKSPACE_ID) {
    throw new Error(
      'Root workspace cannot be used as a destination external project workspace'
    );
  }

  const { error: bindingError } = await admin
    .from('workspace_external_project_bindings')
    .upsert(
      {
        canonical_project_id: canonicalProjectId,
        is_enabled: true,
        updated_by: actorId,
        ws_id: workspaceId,
      },
      { onConflict: 'ws_id' }
    );
  if (bindingError) throw new Error(bindingError.message);

  const { error: deleteError } = await admin
    .from('workspace_secrets')
    .delete()
    .eq('ws_id', workspaceId)
    .in('name', [
      EXTERNAL_PROJECT_ENABLED_SECRET,
      EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
    ]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await admin.from('workspace_secrets').insert([
    {
      name: EXTERNAL_PROJECT_ENABLED_SECRET,
      value: 'true',
      ws_id: workspaceId,
    },
    {
      name: EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
      value: canonicalProjectId,
      ws_id: workspaceId,
    },
  ]);

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: auditError } = await admin
    .from('workspace_external_project_binding_audits')
    .insert({
      actor_user_id: actorId,
      destination_ws_id: workspaceId,
      next_canonical_id: canonicalProjectId,
      previous_canonical_id: previousCanonicalId,
      source_ws_id: ROOT_WORKSPACE_ID,
    });

  if (auditError) {
    throw new Error(auditError.message);
  }
}

async function importExternalProjectFieldDefinitions({
  actorId,
  admin,
  schema,
  workspaceId,
}: {
  actorId: string | null;
  admin: AdminDb;
  schema?: ExternalProjectSyncSchema;
  workspaceId: string;
}) {
  if (!schema) {
    return;
  }

  const { upsertWorkspaceExternalProjectFieldDefinitionsFromSchema } =
    await import('./store');

  await upsertWorkspaceExternalProjectFieldDefinitionsFromSchema(
    {
      actorId,
      schema,
      workspaceId,
    },
    admin
  );
}

async function storeWorkspaceExternalProjectTemplate({
  actorId,
  admin,
  template,
  workspaceId,
}: {
  actorId: string | null;
  admin: AdminDb;
  template?: ExternalProjectSyncManifest['template'];
  workspaceId: string;
}) {
  if (!template) return;
  await setWorkspaceCmsSiteTemplate({
    actorId,
    admin,
    template,
    workspaceId,
  });
}

export async function ensureWorkspaceExternalProjectStudio({
  actorId,
  adapter,
  admin,
  schema,
  scope,
  template,
  workspaceId,
}: {
  /** Null when a linked app provisions its own schema, with no user acting. */
  actorId: string | null;
  adapter: ExternalProjectAdapterKind;
  admin: AdminDb;
  schema?: ExternalProjectSyncSchema;
  scope: ExternalProjectSetupScope;
  template?: ExternalProjectSyncManifest['template'];
  workspaceId: string;
}) {
  const canonicalProjectId = getDefaultCanonicalExternalProjectId(adapter);
  const currentBinding = await resolveWorkspaceExternalProjectBinding(
    workspaceId,
    admin
  );
  const boundCanonicalId =
    currentBinding.enabled &&
    currentBinding.canonical_project &&
    currentBinding.adapter === adapter
      ? currentBinding.canonical_id
      : null;

  if (boundCanonicalId) {
    // Only root setup may touch the shared canonical row; a workspace caller
    // reuses the active project it is already bound to as-is.
    const createdCanonicalProject =
      scope === 'root'
        ? (
            await ensureCanonicalExternalProject({
              actorId,
              adapter,
              admin,
              canonicalProjectId: boundCanonicalId,
              schema,
              template: undefined,
            })
          ).created
        : false;

    await importExternalProjectFieldDefinitions({
      actorId,
      admin,
      schema,
      workspaceId,
    });
    await storeWorkspaceExternalProjectTemplate({
      actorId,
      admin,
      template,
      workspaceId,
    });

    return {
      binding: await resolveWorkspaceExternalProjectBinding(workspaceId, admin),
      createdBinding: false,
      createdCanonicalProject,
    };
  }

  if (currentBinding.canonical_id) {
    throw new Error(
      `Workspace is already configured for ${currentBinding.canonical_id}`
    );
  }

  if (scope !== 'root') {
    throw new ExternalProjectSetupForbiddenError();
  }

  const { created: createdCanonicalProject } =
    await ensureCanonicalExternalProject({
      actorId,
      adapter,
      admin,
      schema,
      template: undefined,
    });

  await bindWorkspaceExternalProject({
    actorId,
    admin,
    canonicalProjectId,
    previousCanonicalId: currentBinding.canonical_id,
    workspaceId,
  });

  await importExternalProjectFieldDefinitions({
    actorId,
    admin,
    schema,
    workspaceId,
  });
  await storeWorkspaceExternalProjectTemplate({
    actorId,
    admin,
    template,
    workspaceId,
  });

  return {
    binding: await resolveWorkspaceExternalProjectBinding(workspaceId, admin),
    createdBinding: true,
    createdCanonicalProject,
  };
}
