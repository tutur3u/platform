import type {
  ExternalProjectDeliveryRelation,
  ExternalProjectDeliveryRelationDefinition,
  ExternalProjectEntryRelation,
  ExternalProjectRelationDefinition,
  ExternalProjectRelationDefinitionTarget,
} from '@tuturuuu/types';

/**
 * The typed relations that start at one entry, in stored order. A relation
 * whose definition no longer exists is left out.
 */
export function projectEntryRelations(
  entryId: string,
  relations: ExternalProjectEntryRelation[],
  definitions: ExternalProjectRelationDefinition[]
): ExternalProjectDeliveryRelation[] {
  return relations
    .filter((relation) => relation.from_entry_id === entryId)
    .flatMap((relation) => {
      const definitionId = relation.relation_definition_id;
      const definition = definitionId
        ? definitions.find((item) => item.id === definitionId)
        : undefined;
      if (!definition || !definitionId) return [];
      return [
        {
          definitionId,
          id: relation.id,
          key: definition.key,
          metadata: relation.metadata,
          relation_definition_id: definitionId,
          relation_type: relation.relation_type,
          sort_order: relation.sort_order,
          to_entry_id: relation.to_entry_id,
        },
      ];
    });
}

/**
 * Relation definitions whose source collection is delivered, each with only
 * its delivered target collections. A definition with no delivered target is
 * left out, since it can only point into private collections. Results are
 * ordered by sort order, key and id so the revision does not depend on read
 * order. Returns undefined when there are none, so a payload without relation
 * definitions keeps its original shape.
 */
export function projectDeliveryRelationDefinitions(
  definitions: ExternalProjectRelationDefinition[],
  targets: ExternalProjectRelationDefinitionTarget[],
  deliveredCollectionIds: ReadonlySet<string>
): ExternalProjectDeliveryRelationDefinition[] | undefined {
  const projected = definitions
    .filter((definition) =>
      deliveredCollectionIds.has(definition.source_collection_id)
    )
    .map((definition) => ({
      cardinality: definition.cardinality,
      id: definition.id,
      inverse_label: definition.inverse_label,
      is_required: definition.is_required,
      key: definition.key,
      label: definition.label,
      sort_order: definition.sort_order,
      source_collection_id: definition.source_collection_id,
      target_collection_ids: targets
        .filter(
          (target) =>
            target.relation_definition_id === definition.id &&
            deliveredCollectionIds.has(target.target_collection_id)
        )
        .map((target) => target.target_collection_id)
        .sort(),
    }))
    .filter((definition) => definition.target_collection_ids.length > 0)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        compareText(left.key, right.key) ||
        compareText(left.id, right.id)
    );
  return projected.length > 0 ? projected : undefined;
}

/**
 * The stored rows of the delivered definitions. Only these may feed the
 * delivery revision timestamp: a definition that is not delivered (private
 * source, or no delivered target) must not reveal when it was edited.
 */
export function deliveredDefinitionRows(
  definitions: ExternalProjectRelationDefinition[],
  delivered: ExternalProjectDeliveryRelationDefinition[] | undefined
) {
  if (!delivered) return [];
  const ids = new Set(delivered.map((definition) => definition.id));
  return definitions.filter((definition) => ids.has(definition.id));
}

function compareText(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * The value the delivery revision hashes beside its timestamp. It is the
 * template alone when no relation definitions are delivered, so those
 * payloads keep their revision; otherwise the definitions are folded in,
 * because a target change carries no timestamp of its own.
 */
export function deliveryRevisionFingerprint(
  template: unknown,
  relationDefinitions: ExternalProjectDeliveryRelationDefinition[] | undefined
) {
  return relationDefinitions
    ? { relationDefinitions, template: template ?? null }
    : template;
}
