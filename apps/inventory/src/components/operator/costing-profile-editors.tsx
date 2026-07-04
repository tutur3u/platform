'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  emptyScenario,
  numeric,
  type ProfitShareInput,
  type ScenarioInput,
} from './costing-profile-form-state';
import { NumberField, TextField } from './operator-form-fields';

export function CostingScenariosEditor({
  onChange,
  scenarios,
}: {
  onChange: (scenarios: ScenarioInput[]) => void;
  scenarios: ScenarioInput[];
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const update = (index: number, patch: Partial<ScenarioInput>) =>
    onChange(
      scenarios.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        {t('steps.scenariosDescription')}
      </p>
      <div className="grid min-w-0 gap-3">
        {scenarios.map((scenario, index) => (
          <div
            className="grid min-w-0 gap-2 rounded-md border border-border p-3"
            key={scenario.id ?? `scenario-${index}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">
                {t('scenario')} {index + 1}
              </span>
              <Button
                aria-label={forms('delete')}
                disabled={scenarios.length === 1}
                onClick={() =>
                  onChange(
                    scenarios.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
              <TextField
                label={t('scenarioName')}
                onChange={(name) => update(index, { name })}
                placeholder={forms('placeholders.batchSize')}
                value={scenario.name}
              />
              <NumberField
                hint={forms('hints.batchSize')}
                label={t('batchSize')}
                onChange={(batchSize) => update(index, { batchSize })}
                placeholder={forms('placeholders.batchSize')}
                value={scenario.batchSize}
              />
              <NumberField
                hint={forms('hints.unitCost')}
                label={t('unitCost')}
                onChange={(manufacturingCostPerUnit) =>
                  update(index, { manufacturingCostPerUnit })
                }
                placeholder={forms('placeholders.unitCost')}
                value={scenario.manufacturingCostPerUnit}
              />
              <NumberField
                hint={t('hints.artCommission')}
                label={t('artCommission')}
                onChange={(artCommissionCost) =>
                  update(index, { artCommissionCost })
                }
                placeholder={forms('placeholders.unitCost')}
                value={scenario.artCommissionCost}
              />
              <NumberField
                hint={t('hints.shipping')}
                label={t('shipping')}
                onChange={(shippingCost) => update(index, { shippingCost })}
                placeholder={forms('placeholders.unitCost')}
                value={scenario.shippingCost}
              />
              <NumberField
                hint={t('hints.tariff')}
                label={t('tariff')}
                onChange={(tariffCost) => update(index, { tariffCost })}
                placeholder={forms('placeholders.unitCost')}
                value={scenario.tariffCost}
              />
              <NumberField
                hint={t('hints.packaging')}
                label={t('packaging')}
                onChange={(packagingCostPerUnit) =>
                  update(index, { packagingCostPerUnit })
                }
                placeholder={forms('placeholders.unitCost')}
                value={scenario.packagingCostPerUnit}
              />
              <NumberField
                hint={t('hints.other')}
                label={t('other')}
                onChange={(otherCostPerUnit) =>
                  update(index, { otherCostPerUnit })
                }
                placeholder={forms('placeholders.unitCost')}
                value={scenario.otherCostPerUnit}
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        className="w-fit"
        onClick={() => onChange([...scenarios, emptyScenario()])}
        type="button"
        variant="outline"
      >
        <Plus className="h-4 w-4" />
        {t('addScenario')}
      </Button>
    </div>
  );
}

export function CostingProfitSharesEditor({
  onChange,
  shares,
}: {
  onChange: (shares: ProfitShareInput[]) => void;
  shares: ProfitShareInput[];
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const sharesTotal = shares.reduce(
    (sum, share) => sum + numeric(share.sharePercentage),
    0
  );
  const sharesOff = shares.length > 0 && Math.abs(sharesTotal - 100) > 0.01;
  const update = (index: number, patch: Partial<ProfitShareInput>) =>
    onChange(
      shares.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        {t('steps.profitSharesDescription')}
      </p>
      <div className="grid min-w-0 gap-2">
        {shares.map((share, index) => (
          <div
            className="grid min-w-0 items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
            key={share.id ?? `share-${index}`}
          >
            <TextField
              label={t('recipient')}
              onChange={(recipientLabel) => update(index, { recipientLabel })}
              placeholder={t('recipient')}
              value={share.recipientLabel}
            />
            <NumberField
              label={t('sharePercentage')}
              onChange={(sharePercentage) => update(index, { sharePercentage })}
              placeholder="0"
              value={share.sharePercentage}
            />
            <Button
              aria-label={forms('delete')}
              onClick={() =>
                onChange(shares.filter((_, itemIndex) => itemIndex !== index))
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          className="w-fit"
          onClick={() =>
            onChange([...shares, { recipientLabel: '', sharePercentage: '' }])
          }
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          {t('addProfitShare')}
        </Button>
        <span
          className={
            sharesOff
              ? 'text-dynamic-orange text-xs'
              : 'text-muted-foreground text-xs'
          }
        >
          {sharesOff
            ? t('sharesWarning', { total: sharesTotal })
            : t('sharesTotal', { total: sharesTotal })}
        </span>
      </div>
    </div>
  );
}
