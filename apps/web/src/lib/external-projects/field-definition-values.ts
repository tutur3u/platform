import type {
  ExternalProjectFieldScope,
  ExternalProjectFieldType,
  Json,
} from '@tuturuuu/types';

export type UpsertFieldDefinitionPayload = {
  collection_id?: string | null;
  default_value?: Json | null;
  description?: string | null;
  field_scope: ExternalProjectFieldScope;
  field_type: ExternalProjectFieldType;
  is_enabled?: boolean;
  is_required?: boolean;
  key: string;
  label?: string | null;
  options?: string[];
  sort_order?: number;
  source?: string;
  actorId: string | null;
  workspaceId: string;
};

export function fieldDefinitionValues(payload: UpsertFieldDefinitionPayload) {
  return {
    collection_id: payload.collection_id ?? null,
    default_value: payload.default_value ?? null,
    description: payload.description ?? null,
    field_scope: payload.field_scope,
    field_type: payload.field_type,
    is_enabled: payload.is_enabled ?? true,
    is_required: payload.is_required ?? false,
    key: payload.key,
    label: payload.label ?? null,
    options: payload.options ?? [],
    sort_order: payload.sort_order ?? 0,
    source: payload.source ?? 'cms',
    updated_by: payload.actorId,
    ws_id: payload.workspaceId,
  };
}
