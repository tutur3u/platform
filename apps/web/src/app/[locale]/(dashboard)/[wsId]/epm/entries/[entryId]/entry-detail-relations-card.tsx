'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { updateWorkspaceExternalProjectEntryBundle } from '@tuturuuu/internal-api';
import type {
  ExternalProjectBlock,
  ExternalProjectEntry,
  ExternalProjectEntryRelation,
  ExternalProjectRelationDefinition,
  ExternalProjectRelationDefinitionTarget,
} from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useEffect, useMemo, useState } from 'react';
import type { EpmStrings } from '../../epm-strings';

type SelectionMap = Record<string, string[]>;

export function EntryDetailRelationsCard({
  blocks,
  definitions,
  entries,
  entry,
  onSaved,
  relations,
  strings,
  targets,
  workspaceId,
}: {
  blocks: ExternalProjectBlock[];
  definitions: ExternalProjectRelationDefinition[];
  entries: ExternalProjectEntry[];
  entry: ExternalProjectEntry;
  onSaved: () => Promise<void>;
  relations: ExternalProjectEntryRelation[];
  strings: EpmStrings;
  targets: ExternalProjectRelationDefinitionTarget[];
  workspaceId: string;
}) {
  const applicableDefinitions = useMemo(
    () =>
      definitions
        .filter(
          (definition) =>
            definition.source_collection_id === entry.collection_id
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [definitions, entry.collection_id]
  );
  const initialSelections = useMemo(
    () =>
      Object.fromEntries(
        applicableDefinitions.map((definition) => [
          definition.id,
          relations
            .filter(
              (relation) =>
                relation.from_entry_id === entry.id &&
                relation.relation_definition_id === definition.id
            )
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((relation) => relation.to_entry_id),
        ])
      ),
    [applicableDefinitions, entry.id, relations]
  );
  const [selections, setSelections] = useState<SelectionMap>(initialSelections);

  useEffect(() => {
    setSelections(initialSelections);
  }, [initialSelections]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceExternalProjectEntryBundle(workspaceId, entry.id, {
        blocks: blocks
          .filter((block) => block.entry_id === entry.id)
          .map((block) => ({
            blockType: block.block_type,
            content: block.content,
            id: block.id,
            sortOrder: block.sort_order,
            stableSourceId: block.stable_source_id,
            title: block.title,
          })),
        entry: {},
        expectedUpdatedAt: entry.updated_at,
        relations: applicableDefinitions.flatMap((definition) =>
          (selections[definition.id] ?? []).map((toEntryId, sortOrder) => ({
            definitionId: definition.id,
            metadata:
              relations.find(
                (relation) =>
                  relation.from_entry_id === entry.id &&
                  relation.relation_definition_id === definition.id &&
                  relation.to_entry_id === toEntryId
              )?.metadata ?? {},
            sortOrder,
            toEntryId,
          }))
        ),
      }),
    onSuccess: async () => {
      await onSaved();
      toast.success(strings.relationsSaveSuccessToast);
    },
  });

  if (applicableDefinitions.length === 0) return null;

  return (
    <Card className="border-border/70 bg-card/95 shadow-none">
      <CardHeader>
        <CardTitle>{strings.relationsTitle}</CardTitle>
        <CardDescription>{strings.relationsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {applicableDefinitions.map((definition) => {
          const targetCollectionIds = new Set(
            targets
              .filter(
                (target) => target.relation_definition_id === definition.id
              )
              .map((target) => target.target_collection_id)
          );
          const options = entries
            .filter(
              (candidate) =>
                candidate.id !== entry.id &&
                targetCollectionIds.has(candidate.collection_id)
            )
            .map((candidate) => ({
              label: candidate.title,
              searchValue: `${candidate.title} ${candidate.slug}`,
              value: candidate.id,
            }));
          const selected = selections[definition.id] ?? [];

          return (
            <div className="space-y-2" key={definition.id}>
              <Label>
                {definition.label}
                {definition.is_required ? ' *' : ''}
              </Label>
              <Combobox
                emptyText={strings.emptyEntries}
                mode={definition.cardinality === 'many' ? 'multiple' : 'single'}
                onChange={(value) =>
                  setSelections((current) => ({
                    ...current,
                    [definition.id]: Array.isArray(value)
                      ? value
                      : value
                        ? [value]
                        : [],
                  }))
                }
                options={options}
                placeholder={strings.searchPlaceholder}
                searchPlaceholder={strings.searchPlaceholder}
                selected={
                  definition.cardinality === 'many'
                    ? selected
                    : (selected[0] ?? '')
                }
              />
            </div>
          );
        })}
        <Button
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          size="sm"
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {strings.saveAction}
        </Button>
      </CardContent>
    </Card>
  );
}
