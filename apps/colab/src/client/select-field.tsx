import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Children, isValidElement, type ReactNode } from 'react';

/** Adapter keeps option declarations readable while using the shared accessible select. */
export function SelectField({
  value,
  onValueChange,
  disabled,
  children,
  label,
}: {
  value: string | number;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
  label: string;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Children.toArray(children).map((child) => {
          if (
            !isValidElement<{ value: string | number; children: ReactNode }>(
              child
            )
          )
            return null;
          return (
            <SelectItem
              key={child.props.value}
              value={String(child.props.value)}
            >
              {child.props.children}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
