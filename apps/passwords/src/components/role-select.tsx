import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useI18n } from '../i18n/provider';
import { VAULT_ROLES, type VaultRole } from '../service/port';

export function RoleSelect({
  value,
  onChange,
  label,
  disabled,
}: {
  value: VaultRole;
  onChange(role: VaultRole): void;
  label: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as VaultRole)}
      disabled={disabled}
    >
      <SelectTrigger className="w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VAULT_ROLES.map((item) => (
          <SelectItem key={item} value={item}>
            {t(`vault.role.${item}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
