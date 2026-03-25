'use client';

import { Plus } from '@tuturuuu/icons';
import type { HabitTrackerFieldSchema } from '@tuturuuu/types/primitives/HabitTracker';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { slugifyFieldKey } from './tracker-shared';

export type FieldDraft = HabitTrackerFieldSchema & {
  manualKey: boolean;
  optionsText: string;
};

function createBlankField(index: number, fieldLabel: string): FieldDraft {
  return {
    key: `field_${index + 1}`,
    label: `${fieldLabel} ${index + 1}`,
    manualKey: false,
    optionsText: '',
    required: false,
    type: 'number',
    unit: '',
  };
}

export default function TrackerFieldBuilder({
  fields,
  labels,
  onChange,
}: {
  fields: FieldDraft[];
  labels: {
    addField: string;
    boolean: string;
    duration: string;
    fieldKey: string;
    fieldKeyHint: string;
    fieldLabel: string;
    fieldOptions: string;
    fieldType: string;
    fieldUnit: string;
    fieldsDescription: string;
    fieldsTitle: string;
    number: string;
    removeField: string;
    required: string;
    select: string;
    text: string;
  };
  onChange: (fields: FieldDraft[]) => void;
}) {
  function updateField(
    index: number,
    updater: (field: FieldDraft) => FieldDraft
  ) {
    onChange(
      fields.map((field, fieldIndex) =>
        fieldIndex === index ? updater(field) : field
      )
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">{labels.fieldsTitle}</h3>
          <p className="text-muted-foreground text-sm">
            {labels.fieldsDescription}
          </p>
        </div>
        <Button
          disabled={fields.length >= 4}
          onClick={() =>
            onChange([
              ...fields,
              createBlankField(fields.length, labels.fieldLabel),
            ])
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          {labels.addField}
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={`${field.key}-${index}`}
            className="rounded-3xl border border-border/70 bg-background/70 p-4"
          >
            <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr,1fr]">
              <div className="space-y-2">
                <Label>{labels.fieldLabel}</Label>
                <Input
                  onChange={(event) =>
                    updateField(index, (current) => ({
                      ...current,
                      key: current.manualKey
                        ? current.key
                        : slugifyFieldKey(event.target.value),
                      label: event.target.value,
                    }))
                  }
                  value={field.label}
                />
              </div>

              <div className="space-y-2">
                <Label>{labels.fieldType}</Label>
                <Select
                  onValueChange={(value) =>
                    updateField(index, (current) => ({
                      ...current,
                      optionsText:
                        value === 'select' ? current.optionsText : '',
                      type: value as FieldDraft['type'],
                    }))
                  }
                  value={field.type}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean">{labels.boolean}</SelectItem>
                    <SelectItem value="number">{labels.number}</SelectItem>
                    <SelectItem value="duration">{labels.duration}</SelectItem>
                    <SelectItem value="text">{labels.text}</SelectItem>
                    <SelectItem value="select">{labels.select}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{labels.fieldUnit}</Label>
                <Input
                  onChange={(event) =>
                    updateField(index, (current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                  value={field.unit ?? ''}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,1fr,auto]">
              <div className="space-y-2">
                <Label>{labels.fieldKey}</Label>
                <Input
                  onChange={(event) =>
                    updateField(index, (current) => ({
                      ...current,
                      key: slugifyFieldKey(event.target.value),
                      manualKey: true,
                    }))
                  }
                  value={field.key}
                />
                <p className="text-muted-foreground text-xs">
                  {labels.fieldKeyHint}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{labels.fieldOptions}</Label>
                <Input
                  className={cn(field.type !== 'select' && 'opacity-70')}
                  disabled={field.type !== 'select'}
                  onChange={(event) =>
                    updateField(index, (current) => ({
                      ...current,
                      optionsText: event.target.value,
                    }))
                  }
                  value={field.optionsText}
                />
              </div>

              <div className="flex items-end justify-between gap-3 lg:justify-end">
                <label className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm">
                  <Checkbox
                    checked={field.required}
                    onCheckedChange={(checked) =>
                      updateField(index, (current) => ({
                        ...current,
                        required: checked === true,
                      }))
                    }
                  />
                  <span>{labels.required}</span>
                </label>

                <Button
                  onClick={() =>
                    onChange(
                      fields.filter((_, fieldIndex) => fieldIndex !== index)
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {labels.removeField}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
