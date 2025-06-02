import { Label } from '../label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';
import { Root } from '@radix-ui/react-select';
import { cn } from '@tuturuuu/utils/format';
import React, { forwardRef } from 'react';

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
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

const SelectField = forwardRef<React.ComponentRef<typeof Root>, Props>(
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
                disabled={option.disabled}
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
