'use client';

import { AlertTriangle, Loader2, RotateCcw } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  ALL_COMPARABLE_FIELDS,
  type ComparableField,
  type CurrentTaskState,
  getChangedFields,
  type TaskSnapshot,
} from '@tuturuuu/utils/task-snapshot';
import { useMemo, useState } from 'react';
import type { EstimationType } from '../estimation-mapping';
import { FieldDiffViewer } from './field-diff-viewer';
import type { RevertibleField } from './hooks/use-task-revert';

interface SelectiveRevertPanelProps {
  snapshot: TaskSnapshot;
  currentTask: CurrentTaskState;
  onRevert: (fields: RevertibleField[]) => Promise<void>;
  isReverting: boolean;
  locale?: string;
  t?: (key: string, options?: { defaultValue?: string }) => string;
  /** Estimation type for displaying points */
  estimationType?: EstimationType;
  /** When true, disables the revert functionality (feature not stable) */
  revertDisabled?: boolean;
}

const defaultT = (key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue || key;

export function SelectiveRevertPanel({
  snapshot,
  currentTask,
  onRevert,
  isReverting,
  locale = 'en',
  t = defaultT,
  estimationType,
  revertDisabled = false,
}: SelectiveRevertPanelProps) {
  const [selectedFields, setSelectedFields] = useState<Set<ComparableField>>(
    new Set()
  );

  // Calculate which fields have changed
  const changedFields = useMemo(
    () => getChangedFields(snapshot, currentTask),
    [snapshot, currentTask]
  );

  // Get snapshot and current values for each field
  const fieldValues = useMemo(() => {
    const values: Record<
      ComparableField,
      { snapshot: unknown; current: unknown }
    > = {} as any;

    for (const field of ALL_COMPARABLE_FIELDS) {
      values[field] = {
        snapshot: getFieldValue(snapshot, field),
        current: getFieldValue(currentTask, field),
      };
    }

    return values;
  }, [snapshot, currentTask]);

  const handleFieldSelect = (field: ComparableField, selected: boolean) => {
    setSelectedFields((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(field);
      } else {
        newSet.delete(field);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedFields(new Set(changedFields));
  };

  const handleDeselectAll = () => {
    setSelectedFields(new Set());
  };

  const handleRevert = async () => {
    if (selectedFields.size === 0) return;
    await onRevert(Array.from(selectedFields) as RevertibleField[]);
  };

  const hasChanges = changedFields.length > 0;
  const hasSelection = selectedFields.size > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          {hasChanges ? (
            <span>
              {t('fields_changed', {
                defaultValue: `${changedFields.length} field(s) different`,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t('no_changes', {
                defaultValue: 'No changes from current state',
              })}
            </span>
          )}
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              disabled={selectedFields.size === changedFields.length}
            >
              {t('select_all', { defaultValue: 'Select all' })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeselectAll}
              disabled={selectedFields.size === 0}
            >
              {t('deselect_all', { defaultValue: 'Deselect all' })}
            </Button>
          </div>
        )}
      </div>

      {/* Warning about revert being disabled */}
      {revertDisabled && (
        <Alert
          variant="default"
          className="border-muted-foreground/30 bg-muted/50"
        >
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-muted-foreground text-sm">
            {t('revert_disabled_warning', {
              defaultValue:
                'Snapshot reversion is currently disabled as this feature is not stable yet.',
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Warning about revert creating history */}
      {!revertDisabled && hasSelection && (
        <Alert
          variant="default"
          className="border-dynamic-orange/30 bg-dynamic-orange/5"
        >
          <AlertTriangle className="h-4 w-4 text-dynamic-orange" />
          <AlertDescription className="text-sm">
            {t('revert_warning', {
              defaultValue:
                'This will create a new history entry documenting the revert.',
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Field list */}
      <div className="space-y-2">
        {/* Core fields */}
        <FieldGroup title={t('core_fields', { defaultValue: 'Core Fields' })}>
          {(
            [
              'name',
              'description',
              'priority',
              'estimation_points',
              'list_id',
              'completed',
            ] as ComparableField[]
          ).map((field) => (
            <FieldDiffViewer
              key={field}
              fieldName={field}
              snapshotValue={fieldValues[field].snapshot}
              currentValue={fieldValues[field].current}
              selected={selectedFields.has(field)}
              onSelectionChange={(selected) =>
                handleFieldSelect(field, selected)
              }
              hasChanged={changedFields.includes(field)}
              locale={locale}
              t={t}
              snapshotListName={snapshot.list_name}
              currentListName={currentTask.list_name}
              estimationType={estimationType}
            />
          ))}
        </FieldGroup>

        {/* Date fields */}
        <FieldGroup title={t('dates', { defaultValue: 'Dates' })}>
          {(['start_date', 'end_date'] as ComparableField[]).map((field) => (
            <FieldDiffViewer
              key={field}
              fieldName={field}
              snapshotValue={fieldValues[field].snapshot}
              currentValue={fieldValues[field].current}
              selected={selectedFields.has(field)}
              onSelectionChange={(selected) =>
                handleFieldSelect(field, selected)
              }
              hasChanged={changedFields.includes(field)}
              locale={locale}
              t={t}
            />
          ))}
        </FieldGroup>

        {/* Relationship fields */}
        <FieldGroup
          title={t('relationships', { defaultValue: 'Relationships' })}
        >
          {(['assignees', 'labels', 'projects'] as ComparableField[]).map(
            (field) => (
              <FieldDiffViewer
                key={field}
                fieldName={field}
                snapshotValue={fieldValues[field].snapshot}
                currentValue={fieldValues[field].current}
                selected={selectedFields.has(field)}
                onSelectionChange={(selected) =>
                  handleFieldSelect(field, selected)
                }
                hasChanged={changedFields.includes(field)}
                locale={locale}
                t={t}
              />
            )
          )}
        </FieldGroup>
      </div>

      {/* Revert button */}
      {hasChanges && !revertDisabled && (
        <div className="flex justify-end border-t pt-4">
          <Button
            onClick={handleRevert}
            disabled={!hasSelection || isReverting}
            className="gap-2"
          >
            {isReverting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {isReverting
              ? t('reverting', { defaultValue: 'Reverting...' })
              : t('revert_selected', {
                  defaultValue: `Revert ${selectedFields.size} field(s)`,
                })}
          </Button>
        </div>
      )}
    </div>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function getFieldValue(
  obj: TaskSnapshot | CurrentTaskState,
  field: ComparableField
): unknown {
  switch (field) {
    case 'name':
      return obj.name;
    case 'description':
      return obj.description;
    case 'priority':
      return obj.priority;
    case 'start_date':
      return obj.start_date;
    case 'end_date':
      return obj.end_date;
    case 'estimation_points':
      return obj.estimation_points;
    case 'list_id':
      return obj.list_id;
    case 'completed':
      return obj.completed;
    case 'assignees':
      return obj.assignees || [];
    case 'labels':
      return obj.labels || [];
    case 'projects':
      return obj.projects || [];
    default:
      return null;
  }
}
