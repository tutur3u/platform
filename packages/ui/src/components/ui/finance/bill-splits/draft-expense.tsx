'use client';

import { SUPPORTED_CURRENCIES } from '@tuturuuu/utils/currencies';
import { useTranslations } from 'next-intl';
import { Button } from '../../button';
import { Input } from '../../input';
import { Label } from '../../label';
import {
  type DraftExpense,
  type DraftPerson,
  emptyLine,
  emptySponsor,
} from './draft';
import { BillSplitDraftLine, BillSplitDraftTransfer } from './draft-allocation';

export function BillSplitDraftExpense({
  expense,
  people,
  settlementCurrency,
  onChange,
  onRemove,
}: {
  expense: DraftExpense;
  people: readonly DraftPerson[];
  settlementCurrency: string;
  onChange: (expense: DraftExpense) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('bill-splits');
  const base = `split-expense-${expense.id}`;
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${base}-name`}>{t('expense')}</Label>
          <Input
            id={`${base}-name`}
            value={expense.label}
            maxLength={120}
            required
            onChange={(event) =>
              onChange({ ...expense, label: event.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${base}-currency`}>{t('currency')}</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            id={`${base}-currency`}
            value={expense.currency}
            onChange={(event) =>
              onChange({ ...expense, currency: event.target.value })
            }
          >
            {SUPPORTED_CURRENCIES.map(({ code }) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        {expense.currency !== settlementCurrency && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${base}-rate`}>
              {t('exchange-rate', { currency: settlementCurrency })}
            </Label>
            <Input
              id={`${base}-rate`}
              value={expense.rate}
              maxLength={20}
              required
              inputMode="decimal"
              onChange={(event) =>
                onChange({ ...expense, rate: event.target.value })
              }
            />
          </div>
        )}
      </div>
      {expense.lines.map((line) => (
        <BillSplitDraftLine
          key={line.id}
          line={line}
          people={people}
          onChange={(next) =>
            onChange({
              ...expense,
              lines: expense.lines.map((item) =>
                item.id === line.id ? next : item
              ),
            })
          }
          onRemove={
            expense.lines.length > 1
              ? () =>
                  onChange({
                    ...expense,
                    lines: expense.lines.filter(({ id }) => id !== line.id),
                  })
              : undefined
          }
        />
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-self-start"
        disabled={expense.lines.length >= 30}
        onClick={() =>
          onChange({ ...expense, lines: [...expense.lines, emptyLine()] })
        }
      >
        {t('add-item')}
      </Button>
      <div className="grid gap-2 sm:grid-cols-3">
        {(['tax', 'tip', 'discount'] as const).map((kind) => (
          <div key={kind} className="grid gap-1.5">
            <Label htmlFor={`${base}-${kind}`}>{t(kind)}</Label>
            <Input
              id={`${base}-${kind}`}
              value={expense.adjustments[kind]}
              maxLength={24}
              inputMode="decimal"
              onChange={(event) =>
                onChange({
                  ...expense,
                  adjustments: {
                    ...expense.adjustments,
                    [kind]: event.target.value,
                  },
                })
              }
            />
          </div>
        ))}
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium text-sm">{t('payers')}</legend>
        {people.map(({ id, label }) => (
          <div key={id} className="flex items-center justify-between gap-3">
            <Label htmlFor={`${base}-paid-${id}`}>{label}</Label>
            <Input
              className="w-28"
              id={`${base}-paid-${id}`}
              value={expense.payments[id] ?? ''}
              maxLength={24}
              inputMode="decimal"
              onChange={(event) =>
                onChange({
                  ...expense,
                  payments: { ...expense.payments, [id]: event.target.value },
                })
              }
            />
          </div>
        ))}
      </fieldset>
      {expense.sponsors.map((row) => (
        <BillSplitDraftTransfer
          row={row}
          people={people}
          key={row.id}
          sponsor
          onChange={(next) =>
            onChange({
              ...expense,
              sponsors: expense.sponsors.map((item) =>
                item.id === row.id ? next : item
              ),
            })
          }
          onRemove={() =>
            onChange({
              ...expense,
              sponsors: expense.sponsors.filter(({ id }) => id !== row.id),
            })
          }
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={expense.sponsors.length >= 30}
          onClick={() =>
            onChange({
              ...expense,
              sponsors: [...expense.sponsors, emptySponsor()],
            })
          }
        >
          {t('add-sponsorship')}
        </Button>
        {onRemove && (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            {t('remove-expense')}
          </Button>
        )}
      </div>
    </section>
  );
}
