import type { Tables } from './supabase';

type EntryRelationRow = Tables<'workspace_external_project_entry_relations'>;
type RelationDefinitionRow =
  Tables<'workspace_external_project_relation_definitions'>;

/**
 * A typed relation from one delivered entry to another. Delivery carries only
 * relations whose definition still exists and whose two entries are both
 * delivered. `definitionId` and `key` mirror `relation_definition_id` and the
 * definition key for clients that read the original shape.
 */
export type ExternalProjectDeliveryRelation = Pick<
  EntryRelationRow,
  'id' | 'to_entry_id' | 'metadata' | 'relation_type' | 'sort_order'
> & {
  definitionId: string;
  key: string;
  relation_definition_id: string;
};

/**
 * A relation definition whose source collection is delivered. Its target
 * collection ids are limited to delivered collections.
 */
export type ExternalProjectDeliveryRelationDefinition = Pick<
  RelationDefinitionRow,
  | 'id'
  | 'key'
  | 'label'
  | 'inverse_label'
  | 'cardinality'
  | 'is_required'
  | 'sort_order'
  | 'source_collection_id'
> & {
  target_collection_ids: string[];
};
