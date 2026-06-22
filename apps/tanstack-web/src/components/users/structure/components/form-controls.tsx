import type { ReactNode } from 'react';
import type { EmploymentHistory } from '../types';

interface TextInputFieldProps {
  id: string;
  label: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}

interface SelectFieldProps {
  children: ReactNode;
  className?: string;
  id: string;
  label?: string;
  onValueChange: (value: string) => void;
  value: string;
}

interface EmploymentSelectProps {
  employments: EmploymentHistory[];
  getEmploymentLabel: (employmentId: string) => string;
  id: string;
  label?: string;
  onValueChange: (value: string) => void;
  value: string;
  className?: string;
}

export function TextInputField({
  id,
  label,
  onValueChange,
  placeholder,
  type = 'text',
  value,
}: TextInputFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-muted-foreground text-sm">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-primary"
      />
    </div>
  );
}

export function SelectField({
  children,
  className,
  id,
  label,
  onValueChange,
  value,
}: SelectFieldProps) {
  return (
    <div className={className}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1 block text-muted-foreground text-sm"
        >
          {label}
        </label>
      ) : null}
      <select
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        {children}
      </select>
    </div>
  );
}

export function EmploymentSelect({
  className,
  employments,
  getEmploymentLabel,
  id,
  label,
  onValueChange,
  value,
}: EmploymentSelectProps) {
  return (
    <SelectField
      className={className}
      id={id}
      label={label}
      value={value}
      onValueChange={onValueChange}
    >
      {employments.map((employment) => (
        <option key={employment.id} value={employment.id}>
          {getEmploymentLabel(employment.id)}
        </option>
      ))}
    </SelectField>
  );
}
