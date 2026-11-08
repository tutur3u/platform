'use client';

import { type ComponentProps, type ReactNode, useId } from 'react';
import { Label } from '../label';
import { SettingItemTab } from './settings-item-tab';

type Validation = { kind: 'valid' } | { kind: 'invalid'; message: ReactNode };

type ControlProps = {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
};

type SettingsFieldProps = Omit<
  ComponentProps<typeof SettingItemTab>,
  'title' | 'description' | 'children'
> & {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  validation?: Validation;
  children: (props: ControlProps) => ReactNode;
};

export function SettingsField({
  id,
  label,
  description,
  validation = { kind: 'valid' },
  children,
  ...rowProps
}: SettingsFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const invalid = validation.kind === 'invalid';
  const describedBy =
    [description ? descriptionId : null, invalid ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <SettingItemTab
      {...rowProps}
      title={<Label htmlFor={controlId}>{label}</Label>}
      description={
        <>
          {description && <div id={descriptionId}>{description}</div>}
          {validation.kind === 'invalid' && (
            <div className="text-dynamic-red" id={errorId} role="alert">
              {validation.message}
            </div>
          )}
        </>
      }
    >
      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': invalid ? true : undefined,
      })}
    </SettingItemTab>
  );
}
