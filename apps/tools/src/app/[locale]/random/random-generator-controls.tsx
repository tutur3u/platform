'use client';

import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { TabsContent } from '@tuturuuu/ui/tabs';
import {
  clampNumber,
  FIELD_LIMITS,
  type IdFormat,
  type RandomGeneratorSettings,
  type TokenFormat,
} from './random-generator-state';

interface RandomGeneratorControlsProps {
  onSettingsChange: (settings: Partial<RandomGeneratorSettings>) => void;
  settings: RandomGeneratorSettings;
  t: (key: string) => string;
}

export function RandomGeneratorControls({
  onSettingsChange,
  settings,
  t,
}: RandomGeneratorControlsProps) {
  return (
    <div className="grid gap-6 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <BatchCountField
        onSettingsChange={onSettingsChange}
        settings={settings}
        t={t}
      />

      <TabsContent className="mt-0" value="ids">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="random-id-format">{t('fields.id_format')}</Label>
            <Select
              value={settings.idFormat}
              onValueChange={(value) =>
                onSettingsChange({ idFormat: value as IdFormat })
              }
            >
              <SelectTrigger id="random-id-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nanoid">{t('formats.nanoid')}</SelectItem>
                <SelectItem value="uuid">{t('formats.uuid')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {settings.idFormat === 'nanoid' && (
            <NumberField
              id="random-id-length"
              label={t('fields.length')}
              max={FIELD_LIMITS.idLength.max}
              min={FIELD_LIMITS.idLength.min}
              value={settings.idLength}
              onChange={(idLength) => onSettingsChange({ idLength })}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent className="mt-0" value="tokens">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="random-token-format">
              {t('fields.token_format')}
            </Label>
            <Select
              value={settings.tokenFormat}
              onValueChange={(value) =>
                onSettingsChange({ tokenFormat: value as TokenFormat })
              }
            >
              <SelectTrigger id="random-token-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base64url">
                  {t('formats.base64url')}
                </SelectItem>
                <SelectItem value="hex">{t('formats.hex')}</SelectItem>
                <SelectItem value="api-key">{t('formats.api_key')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <NumberField
            id="random-token-byte-length"
            label={t('fields.byte_length')}
            max={FIELD_LIMITS.tokenByteLength.max}
            min={FIELD_LIMITS.tokenByteLength.min}
            value={settings.tokenByteLength}
            onChange={(tokenByteLength) =>
              onSettingsChange({ tokenByteLength })
            }
          />

          {settings.tokenFormat === 'api-key' && (
            <div className="grid gap-2">
              <Label htmlFor="random-token-prefix">{t('fields.prefix')}</Label>
              <Input
                id="random-token-prefix"
                value={settings.tokenPrefix}
                onChange={(event) =>
                  onSettingsChange({ tokenPrefix: event.target.value })
                }
              />
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent className="mt-0" value="passwords">
        <div className="grid gap-4">
          <NumberField
            id="random-password-length"
            label={t('fields.password_length')}
            max={FIELD_LIMITS.passwordLength.max}
            min={FIELD_LIMITS.passwordLength.min}
            value={settings.passwordLength}
            onChange={(passwordLength) => onSettingsChange({ passwordLength })}
          />

          <div className="grid gap-3">
            <div className="font-medium text-sm">
              {t('fields.character_sets')}
            </div>
            <PasswordClassCheckbox
              checked={settings.includeUppercase}
              id="random-password-uppercase"
              label={t('fields.uppercase')}
              onCheckedChange={(includeUppercase) =>
                onSettingsChange({ includeUppercase })
              }
            />
            <PasswordClassCheckbox
              checked={settings.includeLowercase}
              id="random-password-lowercase"
              label={t('fields.lowercase')}
              onCheckedChange={(includeLowercase) =>
                onSettingsChange({ includeLowercase })
              }
            />
            <PasswordClassCheckbox
              checked={settings.includeNumbers}
              id="random-password-numbers"
              label={t('fields.numbers')}
              onCheckedChange={(includeNumbers) =>
                onSettingsChange({ includeNumbers })
              }
            />
            <PasswordClassCheckbox
              checked={settings.includeSymbols}
              id="random-password-symbols"
              label={t('fields.symbols')}
              onCheckedChange={(includeSymbols) =>
                onSettingsChange({ includeSymbols })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border bg-background p-3">
            <Label
              className="grid gap-1 font-medium text-sm"
              htmlFor="random-password-ambiguous"
            >
              {t('fields.exclude_ambiguous')}
              <span className="font-normal text-muted-foreground text-xs">
                {t('helpers.exclude_ambiguous')}
              </span>
            </Label>
            <Switch
              checked={settings.excludeAmbiguous}
              id="random-password-ambiguous"
              onCheckedChange={(excludeAmbiguous) =>
                onSettingsChange({ excludeAmbiguous })
              }
            />
          </div>
        </div>
      </TabsContent>
    </div>
  );
}

function BatchCountField({
  onSettingsChange,
  settings,
  t,
}: RandomGeneratorControlsProps) {
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

function NumberField({
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

function PasswordClassCheckbox({
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
