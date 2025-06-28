import type React from 'react';
import { forwardRef } from 'react';
import { Input } from '../input';
import { Label } from '../label';

interface InputFieldProps {
  id: string;
  label?: string;
  placeholder?: string;
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

// Merge the two interfaces
type Props = InputFieldProps & InputProps;

const InputField = forwardRef<HTMLInputElement, Props>(
  ({ id, label, ...props }, ref) => {
    return (
      <div className="grid w-full gap-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <Input id={id} ref={ref} {...props} />
      </div>
    );
  }
);

InputField.displayName = 'InputField';
export { InputField };
