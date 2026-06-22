import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  clampNumber,
  FIELD_LIMITS,
  type RandomGeneratorSettings,
} from './random-generator-state';

interface RandomGeneratorFieldProps {
  onSettingsChange: (settings: Partial<RandomGeneratorSettings>) => void;
  settings: RandomGeneratorSettings;
  t: (key: string) => string;
}

export function BatchCountField({
  onSettingsChange,
  settings,
  t,
}: RandomGeneratorFieldProps) {
  return (
    <NumberField
      id="random-batch-count"
      label={t('fields.batch_count')}
      max={FIELD_LIMITS.batchCount.max}
      min={FIELD_LIMITS.batchCount.min}
      value={settings.batchCount}
      onChange={(batchCount) => onSettingsChange({ batchCount })}
    />
  );
}

export function NumberField({
  id,
  label,
  max,
  min,
  onChange,
  value,
}: {
  id: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) =>
          onChange(clampNumber(event.target.value, min, max))
        }
      />
    </div>
  );
}

export function PasswordClassCheckbox({
  checked,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <Label className="font-normal text-sm" htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}
