import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Root } from '@radix-ui/react-select';
import React, { forwardRef } from 'react';

type SelectOption = {
  value: string;
  label: string;
};

interface ClassNames {
  root?: string;
  label?: string;
  selectTrigger?: string;
  selectContent?: string;
  selectItem?: string;
  selectValue?: string;
}

interface SelectFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  classNames?: ClassNames;
}

export interface SelectProps
  extends React.ComponentPropsWithoutRef<typeof Root> {}

// Merge the two interfaces
type Props = SelectFieldProps & SelectProps;

const SelectField = forwardRef<React.ElementRef<typeof Root>, Props>(
  ({ id, label, placeholder, options, classNames, ...props }, ref) => {
    return (
      <div className={cn('grid gap-2', classNames?.root)}>
        {label && (
          <Label htmlFor={id} className={classNames?.label}>
            {label}
          </Label>
        )}
        <Select {...props}>
          <SelectTrigger ref={ref} className={classNames?.selectTrigger}>
            <SelectValue
              id={id}
              placeholder={placeholder}
              className={classNames?.selectValue}
            />
          </SelectTrigger>
          <SelectContent className={classNames?.selectContent}>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className={classNames?.selectItem}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
);

SelectField.displayName = 'SelectField';
export { SelectField };
