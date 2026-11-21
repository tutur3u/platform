'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useFormatter, useTranslations } from 'next-intl';
import type { CostDimension, MonthForecast } from '@/lib/admin-costs/trends';
import { CostSection, SectionMessage } from './cost-section';
import type { Section } from './cost-view';

const DIMENSIONS: CostDimension[] = ['provider', 'app', 'environment'];

export function CostBreakdown({
  breakdown,
}: {
  breakdown: Section<Record<CostDimension, MonthForecast[]>>;
}) {
  const t = useTranslations('infrastructure-costs');
  const format = useFormatter();
  const usd = (value: number) =>
    format.number(value, { currency: 'USD', style: 'currency' });
  // A period with no verified day is unmeasured, not $0; one with gaps is
  // labeled partial.
  const amount = (value: number, measured: boolean, partial: boolean) =>
    !measured
      ? t('summary.not_measured')
      : partial
        ? `${usd(value)} ${t('summary.partial')}`
        : usd(value);

  return (
    <CostSection title={t('breakdown.title')}>
      {breakdown.kind === 'unavailable' ? (
        <SectionMessage tone="error">{t('section_unavailable')}</SectionMessage>
      ) : (
        <Tabs defaultValue="provider" className="px-4 py-4 md:px-5">
          <TabsList>
            {DIMENSIONS.map((dimension) => (
              <TabsTrigger key={dimension} value={dimension}>
                {t(`breakdown.${dimension}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {DIMENSIONS.map((dimension) => (
            <TabsContent key={dimension} value={dimension}>
              {breakdown.data[dimension].length === 0 ? (
                <SectionMessage>{t('breakdown.empty')}</SectionMessage>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t(`breakdown.${dimension}`)}</TableHead>
                        <TableHead className="text-end">
                          {t('breakdown.previous_month')}
                        </TableHead>
                        <TableHead className="text-end">
                          {t('breakdown.to_date')}
                        </TableHead>
                        <TableHead className="text-end">
                          {t('breakdown.forecast')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.data[dimension].map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium">
                            {row.key}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {amount(
                              row.previousMonthUsd,
                              row.measuredPrevious,
                              row.partialPrevious
                            )}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {amount(
                              row.toDateUsd,
                              row.measuredToDate,
                              row.partialToDate
                            )}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {row.measuredForecast
                              ? usd(row.forecastUsd)
                              : t('summary.not_measured')}
                            {row.measuredForecast && row.incomplete ? (
                              <span className="ms-2 text-muted-foreground text-xs">
                                {t('breakdown.partial')}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </CostSection>
  );
}
