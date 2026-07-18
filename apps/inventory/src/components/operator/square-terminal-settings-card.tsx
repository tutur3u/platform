'use client';

import { MonitorSmartphone } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { SelectValueField } from './operator-form-fields';
import {
  SquareProductionTerminalSetup,
  type SquareTerminalSettingsProps,
} from './square-terminal-production-setup';

export function SquareTerminalSettingsCard(props: SquareTerminalSettingsProps) {
  const t = useTranslations('inventory.operator.square');
  const activeLocationId = props.locationId || props.selectedLocationId;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-border border-b p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-primary/10 text-primary">
            <MonitorSmartphone className="size-4" />
          </span>
          <div>
            <p className="font-semibold">{t('terminalTitle')}</p>
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm leading-6">
              {t('terminalDescription')}
            </p>
          </div>
        </div>
        <Badge
          variant={props.environment === 'production' ? 'warning' : 'outline'}
        >
          {t(`environment.${props.environment}`)}
        </Badge>
      </div>

      {props.environment === 'production' ? (
        <SquareProductionTerminalSetup {...props} />
      ) : (
        <div className="grid gap-4 p-4">
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm leading-6">
            {t('sandboxTerminalHelp')}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectValueField
              allowEmpty={false}
              label={t('locationLabel')}
              onChange={props.setLocationId}
              options={props.locationOptions}
              placeholder={props.selectedLocationPlaceholder}
              value={activeLocationId}
            />
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{t('sandboxDeviceLabel')}</span>
              <Input
                onChange={(event) =>
                  props.setSandboxDeviceId(event.target.value)
                }
                placeholder={props.sandboxDevicePlaceholder}
                value={props.sandboxDeviceId}
              />
            </label>
          </div>
          <Button
            className="w-fit"
            disabled={props.saveDefaultsPending || !activeLocationId}
            onClick={props.onSaveDefaults}
            type="button"
          >
            {props.saveDefaultsPending ? t('saving') : t('saveSandboxRouting')}
          </Button>
        </div>
      )}
    </div>
  );
}
