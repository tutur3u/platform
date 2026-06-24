'use client';

import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { PropField } from './template-definitions';

type TemplateFieldProps = {
  field: PropField;
  onChange: (fieldName: string, value: boolean | number | string) => void;
  value: unknown;
};

export function TemplateField({ field, onChange, value }: TemplateFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={field.name}>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <TemplateFieldControl field={field} onChange={onChange} value={value} />
    </div>
  );
}

function TemplateFieldControl({ field, onChange, value }: TemplateFieldProps) {
  switch (field.type) {
    case 'boolean':
      return (
        <Select
          onValueChange={(nextValue) =>
            onChange(field.name, nextValue === 'true')
          }
          value={value === true ? 'true' : 'false'}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );

    case 'number':
      return (
        <Input
          id={field.name}
          onChange={(event) =>
            onChange(field.name, Number.parseFloat(event.target.value) || 0)
          }
          placeholder={field.placeholder}
          type="number"
          value={typeof value === 'number' ? value : ''}
        />
      );

    case 'select':
      return (
        <Select
          onValueChange={(nextValue) => onChange(field.name, nextValue)}
          value={typeof value === 'string' ? value : ''}
        >
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'textarea':
      return (
        <Textarea
          className="font-mono text-sm"
          id={field.name}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder={field.placeholder}
          rows={6}
          value={typeof value === 'string' ? value : ''}
        />
      );

    case 'date':
    case 'text':
      return (
        <Input
          id={field.name}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder={field.placeholder}
          type={field.type === 'date' ? 'date' : 'text'}
          value={typeof value === 'string' ? value : ''}
        />
      );

    default:
      return null;
  }
}
