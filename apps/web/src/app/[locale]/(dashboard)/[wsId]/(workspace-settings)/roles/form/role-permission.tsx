import { Switch } from '@repo/ui/components/ui/switch';
import { ReactNode } from 'react';

export default function RolePermission({
  icon,
  title,
  description,
  disabled,
  value,
  onChange,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  value?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-start gap-2">
      {icon}
      <div className="w-full">
        <div className="gap flex items-start justify-between">
          <div className="font-semibold">{title}</div>
          <Switch
            id="enable"
            checked={value}
            onCheckedChange={onChange}
            disabled={disabled}
          />
        </div>
        <div className="text-sm opacity-70">{description}</div>
      </div>
    </div>
  );
}
