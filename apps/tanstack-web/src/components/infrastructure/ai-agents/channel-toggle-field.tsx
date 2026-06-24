'use client';

import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';

export function ToggleField({
  defaultChecked,
  id,
  label,
  name,
}: {
  defaultChecked: boolean;
  id: string;
  label: string;
  name: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <Switch defaultChecked={defaultChecked} id={id} name={name} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
