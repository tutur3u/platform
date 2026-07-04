import 'server-only';

import type {
  InventoryOptionTemplate,
  InventoryOptionTemplatePayload,
} from '@tuturuuu/internal-api/inventory';
import {
  createPrivateInventoryClient,
  hasPayloadKey,
  type SupabaseErrorLike,
} from './repository-shared';

async function hydrateOptionTemplates(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  templates: Array<{
    created_at: string | null;
    description: string | null;
    id: string;
    name: string;
    updated_at: string | null;
    ws_id: string;
  }>
): Promise<InventoryOptionTemplate[]> {
  if (templates.length === 0) return [];
  const ids = templates.map((template) => template.id);

  const { data: groups, error: groupsError } = (await inventory
    .from('inventory_option_template_groups')
    .select('id, template_id, name, sort_order')
    .in('template_id', ids)
    .order('sort_order', { ascending: true })) as {
    data: Array<{
      id: string;
      name: string;
      sort_order: number;
      template_id: string;
    }> | null;
    error: SupabaseErrorLike;
  };
  if (groupsError) throw groupsError;

  const groupIds = (groups ?? []).map((group) => group.id);
  const { data: values, error: valuesError } =
    groupIds.length > 0
      ? ((await inventory
          .from('inventory_option_template_values')
          .select('id, group_id, label, value, sort_order')
          .in('group_id', groupIds)
          .order('sort_order', { ascending: true })) as {
          data: Array<{
            group_id: string;
            id: string;
            label: string;
            sort_order: number;
            value: string | null;
          }> | null;
          error: SupabaseErrorLike;
        })
      : { data: [], error: null };
  if (valuesError) throw valuesError;

  const valuesByGroup = new Map<
    string,
    InventoryOptionTemplate['groups'][number]['values']
  >();
  for (const value of values ?? []) {
    const list = valuesByGroup.get(value.group_id) ?? [];
    list.push({
      id: value.id,
      label: value.label,
      sortOrder: value.sort_order,
      value: value.value,
    });
    valuesByGroup.set(value.group_id, list);
  }

  const groupsByTemplate = new Map<string, InventoryOptionTemplate['groups']>();
  for (const group of groups ?? []) {
    const list = groupsByTemplate.get(group.template_id) ?? [];
    list.push({
      id: group.id,
      name: group.name,
      sortOrder: group.sort_order,
      values: valuesByGroup.get(group.id) ?? [],
    });
    groupsByTemplate.set(group.template_id, list);
  }

  return templates.map((template) => ({
    createdAt: template.created_at,
    description: template.description,
    groups: groupsByTemplate.get(template.id) ?? [],
    id: template.id,
    name: template.name,
    updatedAt: template.updated_at,
    wsId: template.ws_id,
  }));
}

export async function listOptionTemplates(
  wsId: string
): Promise<InventoryOptionTemplate[]> {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory
    .from('inventory_option_templates')
    .select('id, ws_id, name, description, created_at, updated_at')
    .eq('ws_id', wsId)
    .order('name', { ascending: true })) as {
    data: Array<{
      created_at: string | null;
      description: string | null;
      id: string;
      name: string;
      updated_at: string | null;
      ws_id: string;
    }> | null;
    error: SupabaseErrorLike;
  };
  if (error) throw error;
  return hydrateOptionTemplates(inventory, data ?? []);
}

export async function getOptionTemplate(
  wsId: string,
  templateId: string
): Promise<InventoryOptionTemplate | null> {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory
    .from('inventory_option_templates')
    .select('id, ws_id, name, description, created_at, updated_at')
    .eq('ws_id', wsId)
    .eq('id', templateId)
    .maybeSingle()) as {
    data: {
      created_at: string | null;
      description: string | null;
      id: string;
      name: string;
      updated_at: string | null;
      ws_id: string;
    } | null;
    error: SupabaseErrorLike;
  };
  if (error) throw error;
  if (!data) return null;
  const [template] = await hydrateOptionTemplates(inventory, [data]);
  return template ?? null;
}

async function replaceTemplateGroups(
  inventory: Awaited<
    ReturnType<typeof createPrivateInventoryClient>
  >['inventory'],
  wsId: string,
  templateId: string,
  groups: NonNullable<InventoryOptionTemplatePayload['groups']>
) {
  const { error: deleteError } = await inventory
    .from('inventory_option_template_groups')
    .delete()
    .eq('template_id', templateId);
  if (deleteError) throw deleteError;

  for (const [groupIndex, group] of groups.entries()) {
    const { data: groupRow, error: groupError } = (await inventory
      .from('inventory_option_template_groups')
      .insert({
        name: group.name,
        sort_order: group.sortOrder ?? groupIndex,
        template_id: templateId,
        ws_id: wsId,
      } as never)
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: SupabaseErrorLike;
    };
    if (groupError) throw groupError;
    if (!groupRow) continue;

    for (const [valueIndex, value] of group.values.entries()) {
      const { error: valueError } = await inventory
        .from('inventory_option_template_values')
        .insert({
          group_id: groupRow.id,
          label: value.label,
          sort_order: value.sortOrder ?? valueIndex,
          value: value.value ?? null,
          ws_id: wsId,
        } as never);
      if (valueError) throw valueError;
    }
  }
}

export async function createOptionTemplate(
  wsId: string,
  payload: InventoryOptionTemplatePayload
): Promise<InventoryOptionTemplate> {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = (await inventory
    .from('inventory_option_templates')
    .insert({
      description: payload.description ?? null,
      name: payload.name,
      ws_id: wsId,
    } as never)
    .select('id')
    .single()) as {
    data: { id: string } | null;
    error: SupabaseErrorLike;
  };
  if (error) throw error;
  if (!data) throw new Error('Failed to create option template');

  await replaceTemplateGroups(inventory, wsId, data.id, payload.groups ?? []);
  const template = await getOptionTemplate(wsId, data.id);
  if (!template) throw new Error('Failed to load option template');
  return template;
}

export async function updateOptionTemplate(
  wsId: string,
  templateId: string,
  payload: Partial<InventoryOptionTemplatePayload>
): Promise<InventoryOptionTemplate | null> {
  const { inventory } = await createPrivateInventoryClient();
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (payload.name !== undefined) update.name = payload.name;
  if (hasPayloadKey(payload, 'description')) {
    update.description = payload.description ?? null;
  }

  const { data, error } = await inventory
    .from('inventory_option_templates')
    .update(update as never)
    .eq('id', templateId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (payload.groups !== undefined) {
    await replaceTemplateGroups(inventory, wsId, templateId, payload.groups);
  }
  return getOptionTemplate(wsId, templateId);
}

export async function deleteOptionTemplate(wsId: string, templateId: string) {
  const { inventory } = await createPrivateInventoryClient();
  const { data, error } = await inventory
    .from('inventory_option_templates')
    .delete()
    .eq('id', templateId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
