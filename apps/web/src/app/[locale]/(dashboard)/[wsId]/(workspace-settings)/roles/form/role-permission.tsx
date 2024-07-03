import { Switch } from '@repo/ui/components/ui/switch';

export default function RolePermission({
  title,
  description,
  disabled,
  value,
  onChange,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  value?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div>
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
  );
}
