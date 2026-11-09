'use client';

import { BarChart3, Wallet } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  DemoCta,
  DemoFrame,
  DemoHeading,
  DemoItem,
  DemoLabel,
  DemoPane,
  DemoPulse,
  DemoStat,
} from './demo-chrome';
import {
  cashflowMonths,
  cashflowPeak,
  financeFigures,
  type TransactionKind,
  transactionRows,
} from './finance-data';

/**
 * Finance room.
 *
 * An illustration of where the money goes: a monthly income-against-spend
 * series that draws itself in, the budget it is measured against, and the last
 * few movements underneath.
 *
 * Every class name is resolved from a static map — never interpolated — so
 * Tailwind can see it, and every entrance animation collapses under reduced
 * motion.
 */

const ACCENT = 'purple' as const;

/** Income and spend read as two fixed series, so their tones are fixed too. */
const seriesTones: Record<TransactionKind, string> = {
  income: 'bg-dynamic-green/70',
  expense: 'bg-dynamic-orange/60',
};

const dotTones: Record<TransactionKind, string> = {
  income: 'bg-dynamic-green',
  expense: 'bg-dynamic-orange',
};

const railTones: Record<TransactionKind, string> = {
  income: 'border-l-dynamic-green/60',
  expense: 'border-l-dynamic-orange/50',
};

const amountTones: Record<TransactionKind, string> = {
  income: 'text-dynamic-green',
  expense: 'text-foreground/70',
};

const EASE = [0.16, 1, 0.3, 1] as const;

function CashflowChart({
  incomeLabel,
  expenseLabel,
}: {
  incomeLabel: string;
  expenseLabel: string;
}) {
  const reduced = useReducedMotion();

  const series: { kind: TransactionKind; label: string }[] = [
    { kind: 'income', label: incomeLabel },
    { kind: 'expense', label: expenseLabel },
  ];

  return (
    <div className="p-3">
      <div className="flex h-28 items-end gap-2 sm:gap-3">
        {cashflowMonths.map((month, index) => (
          <div
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
            key={month.id}
          >
            <div className="flex h-full items-end justify-center gap-1">
              {series.map((entry, seriesIndex) => {
                const value =
                  entry.kind === 'income' ? month.income : month.expense;

                return (
                  <motion.span
                    animate={{ scaleY: 1 }}
                    className={cn(
                      'w-1/3 max-w-2.5 origin-bottom rounded-t-[3px]',
                      seriesTones[entry.kind]
                    )}
                    initial={{ scaleY: reduced ? 1 : 0 }}
                    key={entry.kind}
                    style={{
                      height: `${Math.round((value / cashflowPeak) * 100)}%`,
                    }}
                    transition={{
                      duration: reduced ? 0 : 0.7,
                      ease: EASE,
                      delay: reduced
                        ? 0
                        : 0.1 + index * 0.07 + seriesIndex * 0.04,
                    }}
                  />
                );
              })}
            </div>
            <span className="text-center font-mono-ui text-[0.55rem] text-foreground/30 tabular-nums">
              {month.tick}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-foreground/[0.06] border-t pt-2.5">
        {series.map((entry) => (
          <span className="flex items-center gap-1.5" key={entry.kind}>
            <span
              aria-hidden
              className={cn('h-1.5 w-1.5 rounded-full', dotTones[entry.kind])}
            />
            <DemoLabel className="text-foreground/40">{entry.label}</DemoLabel>
          </span>
        ))}
      </div>
    </div>
  );
}

function BudgetMeter() {
  const t = useTranslations('finance-budgets');
  const reduced = useReducedMotion();

  return (
    <div className="relative overflow-hidden rounded-xl border border-dynamic-purple/20 bg-dynamic-purple/[0.06] p-3.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/50 to-transparent"
      />
      <div className="flex items-center justify-between gap-3">
        <DemoLabel className="text-dynamic-purple">{t('budget')}</DemoLabel>
        <span className="rounded-full border border-dynamic-purple/25 px-2 py-0.5">
          <DemoLabel className="text-dynamic-purple">
            {financeFigures.budgetUsed}
          </DemoLabel>
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
        <motion.div
          animate={{ scaleX: financeFigures.budgetUsedRatio }}
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-dynamic-purple to-dynamic-blue"
          initial={{
            scaleX: reduced ? financeFigures.budgetUsedRatio : 0,
          }}
          transition={{ duration: reduced ? 0 : 1.1, ease: EASE }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5">
          <DemoLabel className="text-foreground/35">{t('spent')}</DemoLabel>
          <span className="font-mono-ui text-[0.68rem] text-foreground/65 tabular-nums">
            {financeFigures.budgetSpent}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <DemoLabel className="text-foreground/35">{t('remaining')}</DemoLabel>
          <span className="font-mono-ui text-[0.68rem] text-foreground/65 tabular-nums">
            {financeFigures.budgetRemaining}
          </span>
        </span>
      </div>
    </div>
  );
}

function TransactionList({
  incomeLabel,
  expenseLabel,
}: {
  incomeLabel: string;
  expenseLabel: string;
}) {
  return (
    <ul className="divide-y divide-foreground/[0.05]">
      {transactionRows.map((row) => (
        <li
          className={cn(
            'flex items-center gap-3 border-l-2 px-3 py-2.5 transition-colors duration-300 hover:bg-foreground/[0.02]',
            railTones[row.kind]
          )}
          key={row.id}
        >
          <span className="font-mono-ui text-[0.62rem] text-foreground/35 tabular-nums">
            {row.date}
          </span>
          <DemoLabel className="truncate text-foreground/45">
            {row.kind === 'income' ? incomeLabel : expenseLabel}
          </DemoLabel>
          <span
            className={cn(
              'ml-auto font-mono-ui text-[0.7rem] tabular-nums',
              amountTones[row.kind]
            )}
          >
            {row.amount}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FinanceDemo() {
  const product = useTranslations('marketing-nav.products');
  const overview = useTranslations('finance-overview');
  const analytics = useTranslations('finance-analytics');
  const kinds = useTranslations('transaction-category-data-table');
  const cta = useTranslations('landing.cta');

  const incomeLabel = kinds('income');
  const expenseLabel = kinds('expense');

  return (
    <DemoPane>
      <DemoItem>
        <DemoHeading
          accent={ACCENT}
          aside={
            <span className="rounded-full border border-dynamic-purple/20 bg-dynamic-purple/[0.06] px-2.5 py-1">
              <DemoLabel className="text-dynamic-purple">
                {analytics('this-year')}
              </DemoLabel>
            </span>
          }
          kicker={product('finance.label')}
          title={product('finance.description')}
        />
      </DemoItem>

      <DemoItem>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          <DemoStat
            accent="green"
            label={overview('total-income')}
            value={financeFigures.income}
          />
          <DemoStat
            accent="orange"
            label={overview('total-expense')}
            value={financeFigures.expense}
          />
          <DemoStat
            accent={ACCENT}
            className="col-span-2 lg:col-span-1"
            label={overview('net-total')}
            value={financeFigures.net}
          />
        </div>
      </DemoItem>

      <DemoItem>
        <DemoFrame
          accent={ACCENT}
          icon={BarChart3}
          label={analytics('income-vs-expense')}
          meta={
            <>
              <DemoPulse accent={ACCENT} />
              <DemoLabel className="hidden text-foreground/40 sm:inline">
                {analytics('monthly')}
              </DemoLabel>
            </>
          }
        >
          <CashflowChart
            expenseLabel={expenseLabel}
            incomeLabel={incomeLabel}
          />
        </DemoFrame>
      </DemoItem>

      <DemoItem>
        <BudgetMeter />
      </DemoItem>

      <DemoItem>
        <DemoFrame
          accent={ACCENT}
          icon={Wallet}
          label={overview('recent-transactions')}
        >
          <TransactionList
            expenseLabel={expenseLabel}
            incomeLabel={incomeLabel}
          />
        </DemoFrame>
      </DemoItem>

      <DemoItem>
        <DemoCta accent={ACCENT}>{cta('primary')}</DemoCta>
      </DemoItem>
    </DemoPane>
  );
}
