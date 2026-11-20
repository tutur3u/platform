'use client';

import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useId } from 'react';
import { Checkbox } from '../checkbox';
import { RadioGroup, RadioGroupItem } from '../radio-group';

interface ChoiceProps {
  options: { value: string; label: ReactNode }[];
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  compact?: boolean;
}

type RespondentChoiceProps = ChoiceProps &
  (
    | { multiple?: false; value: string; onChange: (value: string) => void }
    | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  );

export function RespondentChoice(props: RespondentChoiceProps) {
  const groupId = useId();
  const { disabled, invalid, required, labelledBy, describedBy } = props;
  const accessibility = {
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
  };
  const layout = props.compact ? 'flex flex-wrap gap-2' : 'grid gap-2';
  const options = props.options.map(({ value, label }, index) => {
    const id = `${groupId}-${index}`;
    const selected = props.multiple
      ? props.value.includes(value)
      : props.value === value;

    return (
      <label
        key={value}
        htmlFor={id}
        className={cn(
          'flex min-h-10 min-w-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm',
          selected && 'border-primary bg-primary/10',
          !disabled && 'cursor-pointer hover:bg-accent'
        )}
      >
        {props.multiple ? (
          <Checkbox
            id={id}
            checked={selected}
            disabled={disabled}
            onCheckedChange={(checked) =>
              props.onChange(
                checked === true
                  ? [...props.value, value]
                  : props.value.filter((item) => item !== value)
              )
            }
          />
        ) : (
          <RadioGroupItem id={id} value={value} />
        )}
        <span className="min-w-0 wrap-anywhere">{label}</span>
      </label>
    );
  });

  if (props.multiple) {
    return (
      <div {...accessibility} role="group" className={layout}>
        {options}
      </div>
    );
  }
  return (
    <RadioGroup
      {...accessibility}
      aria-required={required}
      className={layout}
      disabled={disabled}
      value={props.value}
      onValueChange={props.onChange}
    >
      {options}
    </RadioGroup>
  );
}
