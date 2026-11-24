'use client';

import type {
  UpgradePlanCycle,
  WorkspaceUpgradeOptions,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useTranslations } from 'next-intl';
import { plansForCycle, simplePlanName } from './upgrade-dialog-format';
import {
  CycleSwitch,
  useUpgradePlanPrice,
  useUpgradeSeatRange,
} from './upgrade-dialog-plans';

export function ComparePanel({
  cycle,
  data,
  onCycleChange,
}: {
  cycle: UpgradePlanCycle;
  data: WorkspaceUpgradeOptions;
  onCycleChange: (cycle: UpgradePlanCycle) => void;
}) {
  const t = useTranslations('upgrade_dialog');
  const priceOf = useUpgradePlanPrice();
  const seatsOf = useUpgradeSeatRange();
  const plans = plansForCycle(data.plans, cycle);
  const currentId = data.currentPlan?.productId;
  const dash = t('not_applicable');

  return (
    <div className="space-y-5">
      <CycleSwitch cycle={cycle} onChange={onCycleChange} />
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('compare_feature')}</TableHead>
              {plans.map((plan) => (
                <TableHead key={plan.id} scope="col">
                  <span className="flex flex-wrap items-center gap-2">
                    {simplePlanName(plan.name)}
                    {plan.id === currentId && (
                      <Badge>{t('current_badge')}</Badge>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableHead scope="row">{t('compare_price')}</TableHead>
              {plans.map((plan) => (
                <TableCell key={plan.id}>{priceOf(plan, cycle)}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableHead scope="row">{t('compare_seats')}</TableHead>
              {plans.map((plan) => (
                <TableCell key={plan.id}>{seatsOf(plan) ?? dash}</TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableHead scope="row">{t('compare_includes')}</TableHead>
              {plans.map((plan) => (
                <TableCell className="whitespace-normal" key={plan.id}>
                  {plan.description ?? dash}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
